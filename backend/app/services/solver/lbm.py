import numpy as np, time, logging
from typing import Optional, Callable
from dataclasses import dataclass, field
from app.services.solver.lattice import CX, CY, CZ, W, OPPOSITE, NX
from app.services.solver.boundary import BoundaryHandler, BoundaryCondition
from app.services.solver.thermal import ThermalSolver
logger = logging.getLogger(__name__)
try:
    import cupy as cp; GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False; cp = None
@dataclass
class SolverConfig:
    nx: int = 64; ny: int = 64; nz: int = 64; nu: float = 0.02; rho0: float = 1.0
    ux_inlet: float = 0.1; uy_inlet: float = 0.0; uz_inlet: float = 0.0; rho_outlet: float = 1.0
    enable_thermal: bool = False; thermal_diffusivity: float = 0.05; T_inlet: float = 1.0; T_wall: float = 0.0
    max_iters: int = 10000; convergence: float = 1e-6; save_interval: int = 100
    turbulence_model: str = "les"; les_cs: float = 0.17; use_trt: bool = True
    # TRT "magic parameter" Lambda = (1/omega_even - 1/2)(1/omega_odd - 1/2).
    # Lambda=3/16 is the standard recommendation (Ginzburg, d'Humieres &
    # Ginzburg 2008) for eliminating the O(1) boundary-location error of
    # bounce-back walls, independent of viscosity. The previous default
    # expression, 1/(0.5+(1/(0.5+3*0.02))-0.5), algebraically collapses to
    # exactly 0.5+3*0.02=0.56 (the +0.5/-0.5 cancel) -- not a real magic
    # parameter, just a coincidental restatement of tau at nu=0.02.
    omega_magic: float = 3.0/16.0
    solid_mask: Optional[np.ndarray] = None
    boundary_conditions: list = field(default_factory=list)
    on_iteration: Optional[Callable] = None; on_save: Optional[Callable] = None
    # Uniform body force per unit mass (lattice units), e.g. gravity or a
    # pressure-gradient substitute for periodic channel flow.
    body_force: tuple = (0.0, 0.0, 0.0)
    # Boussinesq buoyancy: an additional z-force proportional to how far the
    # scalar field (reusing the thermal/concentration solver) is from
    # scalar_ambient: force_z = buoyancy_accel*(scalar-scalar_ambient).
    # Physically, buoyancy_accel = -g*(rho_gas/rho_ambient - 1): POSITIVE
    # for a gas lighter than ambient (the scalar-rich region is pushed
    # toward +z / up), NEGATIVE for a gas heavier than ambient (pushed
    # toward -z / down, e.g. a dense-gas release hugging the ground) --
    # verified in test_buoyancy_makes_light_gas_rise_and_heavy_gas_sink.
    # Zero (default) disables buoyancy and costs nothing extra.
    # STABILITY: with a *continuous* source_mask (unlike a one-off patch),
    # the buoyancy force is sustained indefinitely and a too-strong
    # buoyancy_accel for the domain's viscosity goes unstable (velocity and
    # even the physically-bounded concentration growing without bound) --
    # see test_source_and_buoyancy_together_need_a_moderate_buoyancy_accel,
    # which pins |0.0005| stable and |0.003| unstable at nu=0.05-0.1 on a
    # small grid. Scale it down (or raise nu) if a continuous-leak run
    # diverges; this is a real stability limit akin to a CFL condition, not
    # a bug to route around.
    buoyancy_accel: float = 0.0
    scalar_ambient: float = 0.0
    # Continuous source: cells in source_mask are held at source_value every
    # iteration (e.g. a gas leak), the same way a Dirichlet wall holds a
    # boundary face -- but anywhere in the domain, not just at a face.
    source_mask: Optional[np.ndarray] = None
    source_value: float = 1.0
    # ThermalSolver always starts its scalar field at 1.0 everywhere (a
    # reasonable default for a normalized temperature scenario, where
    # boundary conditions like T_inlet/T_wall then pull it where it needs to
    # go). Gas dispersion needs the opposite: clean air (0) everywhere except
    # the leak. None (default) keeps the existing behavior unchanged.
    initial_scalar: Optional[float] = None
class LBMSolver:
    def __init__(self, config):
        self.cfg = config; self.use_gpu = GPU_AVAILABLE; self.xp = cp if self.use_gpu else np
        nx, ny, nz = config.nx, config.ny, config.nz
        # Baseline (molecular-viscosity-only) relaxation time/rate. The
        # actual per-iteration collision uses an *effective* rate computed
        # in collide() from nu + the local LES eddy viscosity, since that
        # varies cell-to-cell and iteration-to-iteration once a turbulence
        # model is active -- see compute_les_viscosity().
        self.tau = 0.5+3.0*config.nu; self.omega = 1.0/self.tau
        self.cx = self.xp.asarray(CX, dtype=self.xp.float32); self.cy = self.xp.asarray(CY, dtype=self.xp.float32)
        self.cz = self.xp.asarray(CZ, dtype=self.xp.float32); self.w = self.xp.asarray(W, dtype=self.xp.float32)
        self.opposite = self.xp.asarray(OPPOSITE)
        self.f = self.xp.zeros((NX, nx, ny, nz), dtype=self.xp.float32)
        for i in range(NX): self.f[i] = self.w[i]*config.rho0
        if config.solid_mask is not None: self.solid = self.xp.asarray(config.solid_mask)
        else: self.solid = self.xp.zeros((nx, ny, nz), dtype=bool)
        self.source_mask = self.xp.asarray(config.source_mask) if config.source_mask is not None else None
        self.rho = self.xp.ones((nx, ny, nz), dtype=self.xp.float32)*config.rho0
        self.ux = self.xp.zeros((nx, ny, nz), dtype=self.xp.float32)
        self.uy = self.xp.zeros((nx, ny, nz), dtype=self.xp.float32)
        self.uz = self.xp.zeros((nx, ny, nz), dtype=self.xp.float32)
        if config.enable_thermal:
            self.thermal = ThermalSolver(nx, ny, nz, config.thermal_diffusivity)
            if config.initial_scalar is not None:
                for i in range(self.thermal.T_N): self.thermal.g[i] = self.thermal.T_W[i]*config.initial_scalar
            if self.use_gpu: self.thermal.g = cp.asarray(self.thermal.g)
        else: self.thermal = None
        # Gate the forcing-term work entirely when unused (the common case
        # for every pre-existing simulation type) so it costs nothing extra.
        self.has_force = (tuple(config.body_force) != (0.0, 0.0, 0.0)) or (config.buoyancy_accel != 0.0 and self.thermal is not None)
        # Combining Guo forcing with TRT's symmetric/antisymmetric split near
        # solid walls does not currently reproduce the exact body-force
        # Poiseuille solution (verified: plain BGK matches it to ~0.2%, TRT
        # was off by ~6x with a non-constant, wall-dependent error -- getting
        # a forcing scheme exactly right for a *split*-relaxation-time
        # collision operator near boundaries is a known hard problem in the
        # LBM literature, not a quick fix). Force BGK whenever forcing is
        # active so buoyancy-driven runs (gas dispersion) use the verified
        # path rather than a plausible-looking but wrong one.
        self.use_trt = config.use_trt and not self.has_force
        self._fx = self._fy = self._fz = None
        self.nu_turb = self.xp.zeros((nx, ny, nz), dtype=self.xp.float32)
        self.prev_rho = self.rho.copy(); self.prev_speed = self.xp.zeros((nx, ny, nz), dtype=self.xp.float32)
        self.iteration = 0; self.residual = 1.0
    def equilibrium(self, rho, ux, uy, uz):
        f_eq = self.xp.zeros_like(self.f); u_sq = ux*ux+uy*uy+uz*uz
        for i in range(NX):
            ci_dot_u = self.cx[i]*ux+self.cy[i]*uy+self.cz[i]*uz
            f_eq[i] = self.w[i]*rho*(1.0+3.0*ci_dot_u+4.5*ci_dot_u**2-1.5*u_sq)
        return f_eq
    def compute_macroscopic(self):
        # einsum computes the weighted sum directly instead of materializing
        # a full (19,nx,ny,nz) f*cx product array first (~35% faster on a
        # 64^3 grid) -- same result, just without the throwaway intermediate.
        self.rho = self.xp.einsum('ixyz->xyz', self.f)
        rho_safe = self.xp.where(self.rho > 1e-10, self.rho, 1.0)
        self.ux = self.xp.einsum('i,ixyz->xyz', self.cx, self.f)/rho_safe
        self.uy = self.xp.einsum('i,ixyz->xyz', self.cy, self.f)/rho_safe
        self.uz = self.xp.einsum('i,ixyz->xyz', self.cz, self.f)/rho_safe
        if self.has_force:
            # Guo, Zheng & Shi (2002) half-force velocity correction: with an
            # applied body force, the physically correct velocity is the raw
            # momentum-based one plus half the local acceleration -- using
            # the raw velocity in the equilibrium/LES/reporting would be
            # off by O(force) at every step, not just a rounding error.
            fx = self.xp.full_like(self.rho, self.cfg.body_force[0])
            fy = self.xp.full_like(self.rho, self.cfg.body_force[1])
            fz = self.xp.full_like(self.rho, self.cfg.body_force[2])
            if self.cfg.buoyancy_accel != 0.0 and self.thermal is not None:
                scalar = self.thermal.temperature()
                fz = fz + self.cfg.buoyancy_accel*(scalar-self.cfg.scalar_ambient)
            self._fx, self._fy, self._fz = fx, fy, fz
            self.ux = self.ux + fx/2.0; self.uy = self.uy + fy/2.0; self.uz = self.uz + fz/2.0
        self.ux[self.solid] = 0; self.uy[self.solid] = 0; self.uz[self.solid] = 0
    def compute_les_viscosity(self):
        if self.cfg.turbulence_model == "none": return
        cs = self.cfg.les_cs; dx = 1.0
        duxdx = self._central_diff(self.ux, 0); duxdy = self._central_diff(self.ux, 1); duxdz = self._central_diff(self.ux, 2)
        duydx = self._central_diff(self.uy, 0); duydy = self._central_diff(self.uy, 1); duydz = self._central_diff(self.uy, 2)
        duzdx = self._central_diff(self.uz, 0); duzdy = self._central_diff(self.uz, 1); duzdz = self._central_diff(self.uz, 2)
        S = self.xp.sqrt(2*(duxdx**2+duydy**2+duzdz**2)+(duxdy+duydx)**2+(duxdz+duzdx)**2+(duydz+duzdy)**2)
        self.nu_turb = (cs*dx)**2*S
    def _central_diff(self, field, axis):
        return (self.xp.roll(field, -1, axis=axis)-self.xp.roll(field, 1, axis=axis))/2.0
    def collide(self):
        self.compute_macroscopic(); self.compute_les_viscosity()
        f_eq = self.equilibrium(self.rho, self.ux, self.uy, self.uz)
        # Effective viscosity = molecular + LES subgrid (nu_turb is zero
        # everywhere when turbulence_model="none", so this reduces exactly
        # to the laminar case). Previously nu_turb was computed every
        # iteration and then never used -- the collision always relaxed
        # with the fixed molecular-only omega/tau from __init__, so
        # selecting "les" added no subgrid dissipation at all.
        nu_eff = self.cfg.nu + self.nu_turb
        omega_eff = 1.0/(0.5+3.0*nu_eff)
        if self.use_trt:
            omega_odd = omega_eff
            # Lambda = (1/omega_even - 1/2)(1/omega_odd - 1/2) solved for
            # omega_even is 1/omega_even = 1/2 + Lambda/(1/omega_odd - 1/2)
            # -- Lambda divided by the odd term, not multiplied. The
            # previous (multiplying) formula put omega_even within ~2% of
            # the hard omega=2 stability limit for typical viscosities
            # instead of the moderate ~0.3-0.7 the Lambda=3/16 choice is
            # meant to give, leaving the symmetric relaxation mode barely
            # damped -- stable on its own, but a small added body force was
            # enough to excite it into unbounded growth (verified against
            # the exact body-force Poiseuille solution below).
            omega_even = 1.0/(0.5+self.cfg.omega_magic/(1.0/omega_odd-0.5))
            # Algebraically expanding the textbook symmetric/antisymmetric
            # form (f_sym + omega_even*(f_eq_sym-f_sym) + f_anti +
            # omega_odd*(f_eq_anti-f_anti)) and collecting terms in f,
            # f_opposite, f_eq and f_eq_opposite gives this equivalent but
            # much cheaper form -- 6 large temporary arrays instead of ~13
            # (verified numerically equivalent to <1e-6), roughly halving
            # the cost of this step on a 64^3 grid.
            f_opp = self.f[self.opposite]; f_eq_opp = f_eq[self.opposite]
            C = 0.5*(omega_even+omega_odd); B = 0.5*(omega_odd-omega_even)
            self.f = self.f + C*(f_eq-self.f) + B*(f_opp-f_eq_opp)
        else: self.f += omega_eff*(f_eq-self.f)
        if self.has_force:
            F_raw = self._raw_forcing(self.ux, self.uy, self.uz, self._fx, self._fy, self._fz)
            if self.use_trt:
                # The force term needs the same symmetric/antisymmetric split
                # as the collision itself: applying a single BGK-style
                # (1-omega/2) prefactor on top of a TRT relaxation is *not*
                # equivalent and was verified (via the exact body-force
                # Poiseuille solution below) to never reach steady state --
                # each direction's share of the force must be relaxed at the
                # same rate (omega_even or omega_odd) its population is.
                F_sym = 0.5*(F_raw+F_raw[self.opposite]); F_anti = 0.5*(F_raw-F_raw[self.opposite])
                self.f = self.f + (1.0-0.5*omega_even)*F_sym + (1.0-0.5*omega_odd)*F_anti
            else:
                self.f = self.f + (1.0-0.5*omega_eff)*F_raw
        if self.thermal is not None: self.thermal.collide(self.thermal.temperature(), self.ux, self.uy, self.uz)
    def _raw_forcing(self, ux, uy, uz, fx, fy, fz):
        # Guo, Zheng & Shi (2002), "Discrete lattice effects on the forcing
        # term in the lattice Boltzmann method", Phys. Rev. E 65, 046308,
        # without its (1-omega/2) prefactor (applied by the caller, since it
        # differs between BGK and TRT's two relaxation rates):
        # w_i * [3(c_i-u).F + 9(c_i.u)(c_i.F)] (3=1/cs^2, 9=1/cs^4, cs^2=1/3).
        # ux/uy/uz here are already the Guo-corrected velocity from
        # compute_macroscopic.
        F = self.xp.zeros_like(self.f)
        for i in range(NX):
            ci_dot_u = self.cx[i]*ux + self.cy[i]*uy + self.cz[i]*uz
            ci_dot_F = self.cx[i]*fx + self.cy[i]*fy + self.cz[i]*fz
            term = 3.0*((self.cx[i]-ux)*fx + (self.cy[i]-uy)*fy + (self.cz[i]-uz)*fz) + 9.0*ci_dot_u*ci_dot_F
            F[i] = self.w[i]*term
        return F
    def stream(self):
        for i in range(1, NX):
            self.f[i] = self.xp.roll(self.f[i], shift=(int(self.cx[i]),int(self.cy[i]),int(self.cz[i])), axis=(0,1,2))
        if self.thermal is not None: self.thermal.stream()
    def apply_boundary_conditions(self):
        for bc in self.cfg.boundary_conditions:
            if bc.bc_type == 'velocity':
                self.f = BoundaryHandler.apply_velocity_bc(self.f, bc.face, bc.params.get('ux',0), bc.params.get('uy',0), bc.params.get('uz',0), self.rho, self.cx, self.cy, self.cz, self.w)
            elif bc.bc_type == 'pressure':
                self.f = BoundaryHandler.apply_pressure_bc(self.f, bc.face, bc.params.get('rho',1.0), self.cx, self.cy, self.cz, self.w)
            elif bc.bc_type == 'outflow':
                self.f = BoundaryHandler.apply_outflow_bc(self.f, bc.face)
            elif bc.bc_type == 'wall':
                self.f = BoundaryHandler.apply_wall_bc(self.f, bc.face, self.opposite)
            elif bc.bc_type == 'thermal':
                if self.thermal: self.thermal.apply_thermal_bc(bc.face, bc.params.get('T', 1.0))
        if self.solid.any():
            self.f = BoundaryHandler.apply_bounce_back(self.f, self.solid, self.opposite)
            if self.thermal is not None: self.thermal.apply_thermal_bounce_back(self.solid, self.cfg.T_wall)
        if self.source_mask is not None and self.thermal is not None:
            # Continuous source (e.g. a gas leak): hold these cells at
            # source_value every iteration, the same equilibrium-injection
            # a Dirichlet wall uses, but anywhere in the domain rather than
            # only at a boundary face.
            for i in range(self.thermal.T_N):
                self.thermal.g[i][self.source_mask] = self.thermal.T_W[i]*self.cfg.source_value
    def check_convergence(self):
        # Density alone is not a meaningful convergence signal for buoyancy/
        # source-driven flows (gas dispersion): density barely changes while
        # the velocity field and the dispersing plume are still actively
        # developing, so a density-only check declared "converged" at
        # iteration 0 before the plume had even formed. Tracking velocity
        # too (and requiring both to be settled) catches that case; it's a
        # strict superset of the old check for every existing use, since
        # rho_diff alone can no longer trigger it early on its own.
        rho_diff = self.xp.linalg.norm(self.rho-self.prev_rho)/max(self.xp.linalg.norm(self.prev_rho), 1e-10)
        speed = self.xp.sqrt(self.ux**2+self.uy**2+self.uz**2)
        speed_norm = self.xp.linalg.norm(speed)
        speed_diff = self.xp.linalg.norm(speed-self.prev_speed)/max(float(speed_norm), 1e-10)
        self.prev_rho = self.rho.copy(); self.prev_speed = speed.copy()
        self.residual = max(float(rho_diff), float(speed_diff))
        return self.residual < self.cfg.convergence
    def run(self):
        start_time = time.time(); results = {"iterations": [], "residuals": [], "field_snapshots": []}
        for it in range(self.cfg.max_iters):
            self.iteration = it; self.collide(); self.stream()
            self.apply_boundary_conditions(); self.compute_macroscopic()
            converged = self.check_convergence()
            if it % self.cfg.save_interval == 0 or converged:
                snapshot = self._save_snapshot(it)
                results["iterations"].append(it); results["residuals"].append(self.residual)
                results["field_snapshots"].append(snapshot)
                if self.cfg.on_iteration: self.cfg.on_iteration(it/self.cfg.max_iters, self.residual)
            if converged: break
        elapsed = time.time()-start_time
        results["final"] = self._save_snapshot(self.iteration)
        results["total_iterations"] = self.iteration; results["converged"] = converged
        results["compute_time"] = elapsed; results["grid_size"] = f"{self.cfg.nx}x{self.cfg.ny}x{self.cfg.nz}"
        results["gpu_used"] = self.use_gpu; return results
    def _save_snapshot(self, iteration):
        def to_cpu(arr):
            if self.use_gpu: return cp.asnumpy(arr)
            return np.array(arr)
        snapshot = {"iteration": iteration,
            "rho_stats": {"min": float(to_cpu(self.rho.min())), "max": float(to_cpu(self.rho.max())), "mean": float(to_cpu(self.rho.mean()))},
            "velocity_stats": {"max": float(to_cpu(self.xp.sqrt(self.ux**2+self.uy**2+self.uz**2).max())), "mean": float(to_cpu(self.xp.sqrt(self.ux**2+self.uy**2+self.uz**2).mean()))}}
        if self.thermal is not None:
            T = self.thermal.temperature()
            if self.use_gpu: T = cp.asnumpy(T)
            snapshot["temperature_stats"] = {"min": float(np.min(T)), "max": float(np.max(T)), "mean": float(np.mean(T))}
        return snapshot
    def export_vtk(self, filepath):
        def to_cpu(arr):
            if self.use_gpu: return cp.asnumpy(arr)
            return np.array(arr)
        rho = to_cpu(self.rho); ux = to_cpu(self.ux); uy = to_cpu(self.uy); uz = to_cpu(self.uz)
        vel_mag = np.sqrt(ux**2+uy**2+uz**2)
        nx, ny, nz = self.cfg.nx, self.cfg.ny, self.cfg.nz
        with open(filepath, 'w') as f:
            f.write("# vtk DataFile Version 3.0\nMMX Mechanics CFD\nASCII\nDATASET STRUCTURED_POINTS\n")
            f.write(f"DIMENSIONS {nx} {ny} {nz}\nORIGIN 0 0 0\nSPACING 1 1 1\nPOINT_DATA {nx*ny*nz}\n")
            f.write("SCALARS density float 1\nLOOKUP_TABLE default\n")
            f.write(' '.join(map(str, rho.flatten()))+'\n')
            f.write("SCALARS velocity_magnitude float 1\nLOOKUP_TABLE default\n")
            f.write(' '.join(map(str, vel_mag.flatten()))+'\n')
            if self.thermal is not None:
                T = to_cpu(self.thermal.temperature())
                f.write("SCALARS temperature float 1\nLOOKUP_TABLE default\n")
                f.write(' '.join(map(str, T.flatten()))+'\n')
