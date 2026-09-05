import numpy as np
from app.services.solver.lattice import OPPOSITE, CX, CY, CZ, W, NX

# Which of the 19 lattice directions are tangential to a x-normal boundary
# (cx=0), point toward -x (cx<0) or toward +x (cx>0). At a west (x=0) face
# the cx>0 populations are the unknowns (streamed in from outside the
# domain); at an east (x=-1) face the cx<0 populations are the unknowns.
# Used by the Zou/He boundary conditions below.
_CX0 = np.where(CX == 0)[0]
_CXNEG = np.where(CX < 0)[0]
_CXPOS = np.where(CX > 0)[0]


class BoundaryCondition:
    def __init__(self, face, bc_type, **kwargs):
        self.face = face; self.bc_type = bc_type; self.params = kwargs


class BoundaryHandler:
    @staticmethod
    def _reconstruct(f, x_index, unknown_idx, rho_face, ux, uy, uz, cx, cy, cz, w):
        # Non-equilibrium bounce-back closure (Zou & He 1997; generalized to
        # D3Q19 by Hecht & Harting 2010): each unknown population is set to
        # its own equilibrium at the wall state, plus the non-equilibrium
        # part of its (known) opposite direction. Every unknown direction's
        # opposite is one of the known directions at that face by
        # construction, so this is always well-defined. Closing the unknowns
        # with pure equilibrium instead (dropping their non-equilibrium/
        # stress content entirely) is simpler but was measurably less
        # numerically robust under iteration.
        u_sq = ux*ux + uy*uy + uz*uz
        for i in unknown_idx:
            opp = OPPOSITE[i]
            ci_dot_u = cx[i]*ux + cy[i]*uy + cz[i]*uz
            copp_dot_u = cx[opp]*ux + cy[opp]*uy + cz[opp]*uz
            f_eq_i = w[i]*rho_face*(1 + 3*ci_dot_u + 4.5*ci_dot_u**2 - 1.5*u_sq)
            f_eq_opp = w[opp]*rho_face*(1 + 3*copp_dot_u + 4.5*copp_dot_u**2 - 1.5*u_sq)
            f[i, x_index, :, :] = f_eq_i + (f[opp, x_index, :, :] - f_eq_opp)

    @staticmethod
    def apply_velocity_bc(f, face, ux, uy, uz, rho, cx, cy, cz, w):
        # Zou & He (1997) velocity boundary condition, generalized from D2Q9
        # to D3Q19 by grouping the extra out-of-plane directions into the
        # tangential (cx=0) set. Mass conservation across the missing links
        # gives the wall density from the known populations; see
        # _reconstruct for how the unknown populations are closed.
        if face == 'west':
            f_cx0 = sum(f[i, 0, :, :] for i in _CX0)
            f_cxneg = sum(f[i, 0, :, :] for i in _CXNEG)
            rho_face = (f_cx0 + 2*f_cxneg) / (1 - ux)
            BoundaryHandler._reconstruct(f, 0, _CXPOS, rho_face, ux, uy, uz, cx, cy, cz, w)
        elif face == 'east':
            f_cx0 = sum(f[i, -1, :, :] for i in _CX0)
            f_cxpos = sum(f[i, -1, :, :] for i in _CXPOS)
            rho_face = (f_cx0 + 2*f_cxpos) / (1 + ux)
            BoundaryHandler._reconstruct(f, -1, _CXNEG, rho_face, ux, uy, uz, cx, cy, cz, w)
        return f

    @staticmethod
    def apply_pressure_bc(f, face, rho_target, cx, cy, cz, w):
        # Same Zou/He closure as apply_velocity_bc solved the other way: the
        # normal velocity is derived from the known populations and the
        # *prescribed* density, instead of the density from a prescribed
        # velocity. Tangential velocity is taken as zero (matching the
        # velocity BC's own level of approximation above).
        if face == 'west':
            f_cx0 = sum(f[i, 0, :, :] for i in _CX0)
            f_cxneg = sum(f[i, 0, :, :] for i in _CXNEG)
            ux = 1 - (f_cx0 + 2*f_cxneg)/rho_target
            BoundaryHandler._reconstruct(f, 0, _CXPOS, rho_target, ux, 0.0, 0.0, cx, cy, cz, w)
        elif face == 'east':
            f_cx0 = sum(f[i, -1, :, :] for i in _CX0)
            f_cxpos = sum(f[i, -1, :, :] for i in _CXPOS)
            ux = (f_cx0 + 2*f_cxpos)/rho_target - 1
            BoundaryHandler._reconstruct(f, -1, _CXNEG, rho_target, ux, 0.0, 0.0, cx, cy, cz, w)
        return f

    @staticmethod
    def apply_bounce_back(f, solid_mask, opposite=OPPOSITE):
        # Full-way bounce-back no-slip wall: at each solid node, the
        # population that arrived from direction i is reflected straight
        # back the way it came, f_new[i] = f_old[opposite[i]] for every i
        # simultaneously. Must snapshot ALL 19 directions before writing any
        # of them back -- looping the swap "f[i] <-> f[opposite[i]]" over
        # every i (as opposed to just the pairs) processes each pair twice
        # and undoes itself, leaving walls with zero effect on the flow.
        snapshot = f[:, solid_mask].copy()
        f[:, solid_mask] = snapshot[opposite]
        return f

    @staticmethod
    def apply_wall_bc(f, face, opposite=OPPOSITE):
        # Stationary no-slip wall at a domain face: the same full-way
        # bounce-back as an internal solid obstacle (apply_bounce_back),
        # restricted to the one-cell-thick boundary plane instead of a 3D
        # mask. Was previously unimplemented -- 'wall' boundary conditions
        # (the frontend's default for the north/south faces) were silently
        # ignored, leaving those faces periodic instead of solid.
        plane = {'west': (slice(None), 0), 'east': (slice(None), -1),
                 'south': (slice(None), slice(None), 0), 'north': (slice(None), slice(None), -1),
                 'bottom': (slice(None), slice(None), slice(None), 0), 'top': (slice(None), slice(None), slice(None), -1)}.get(face)
        if plane is not None:
            f[plane] = f[plane][opposite]
        return f

    @staticmethod
    def apply_outflow_bc(f, face):
        if face == 'east': f[:,-1,:,:] = f[:,-2,:,:]
        elif face == 'west': f[:,0,:,:] = f[:,1,:,:]
        elif face == 'north': f[:,:,-1,:] = f[:,:,-2,:]
        elif face == 'south': f[:,:,0,:] = f[:,:,1,:]
        elif face == 'top': f[:,:,:,-1] = f[:,:,:,-2]
        elif face == 'bottom': f[:,:,:,0] = f[:,:,:,1]
        return f
