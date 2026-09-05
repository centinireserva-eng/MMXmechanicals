import numpy as np


class ThermalSolver:
    # D3Q7 advection-diffusion lattice (Krueger et al. 2017, "The Lattice
    # Boltzmann Method", ch. 8): rest particle + 6 face neighbors. Weights
    # w0=1/4, wi=1/8 give lattice sound speed cs_T^2 = sum(w_i*cx_i^2) = 1/4
    # and sum to 1 (energy/temperature-conserving). The previous weights
    # (1/7, 1/14 x6) summed to 4/7, not 1 -- violating the basic
    # normalization every LBM equilibrium distribution must satisfy.
    T_CX = np.array([0,1,-1,0,0,0,0]); T_CY = np.array([0,0,0,1,-1,0,0])
    T_CZ = np.array([0,0,0,0,0,1,-1]); T_W = np.array([1/4,1/8,1/8,1/8,1/8,1/8,1/8]); T_N = 7
    CS2_T = 1.0/4.0
    assert abs(T_W.sum() - 1.0) < 1e-12, "D3Q7 thermal weights must sum to 1"

    def __init__(self, nx, ny, nz, thermal_diffusivity=0.05):
        self.nx, self.ny, self.nz = nx, ny, nz; self.alpha = thermal_diffusivity
        # alpha = cs_T^2 * (tau_t - 1/2)  =>  tau_t = alpha/cs_T^2 + 1/2
        self.tau_t = self.alpha/self.CS2_T + 0.5; self.omega_t = 1.0/self.tau_t
        self.g = np.zeros((self.T_N, nx, ny, nz), dtype=np.float32)
        for i in range(self.T_N): self.g[i] = self.T_W[i]

    def equilibrium(self, T, ux, uy, uz):
        # Standard linear advection-diffusion equilibrium (passive scalar):
        # g_eq_i = w_i * T * (1 + c_i.u / cs_T^2). Unlike the fluid solver's
        # D3Q19 equilibrium, no quadratic-in-u term is included -- the
        # scalar transport equation dT/dt + u.grad(T) = alpha*lap(T) only
        # needs the first-order term to be recovered via Chapman-Enskog.
        g_eq = np.zeros_like(self.g)
        for i in range(self.T_N):
            ci_dot_u = self.T_CX[i]*ux+self.T_CY[i]*uy+self.T_CZ[i]*uz
            g_eq[i] = self.T_W[i]*T*(1.0 + ci_dot_u/self.CS2_T)
        return g_eq

    def collide(self, T, ux, uy, uz):
        g_eq = self.equilibrium(T, ux, uy, uz); self.g += self.omega_t*(g_eq-self.g)

    def stream(self):
        for i in range(1, self.T_N):
            self.g[i] = np.roll(self.g[i], shift=(int(self.T_CX[i]),int(self.T_CY[i]),int(self.T_CZ[i])), axis=(0,1,2))

    def temperature(self): return np.sum(self.g, axis=0)

    def apply_thermal_bc(self, face, T_value):
        if face == 'west':
            for i in range(self.T_N): self.g[i,0,:,:] = self.T_W[i]*T_value
        elif face == 'east':
            for i in range(self.T_N): self.g[i,-1,:,:] = self.T_W[i]*T_value
        elif face == 'south':
            for i in range(self.T_N): self.g[i,:,0,:] = self.T_W[i]*T_value
        elif face == 'north':
            for i in range(self.T_N): self.g[i,:,-1,:] = self.T_W[i]*T_value
        elif face == 'bottom':
            for i in range(self.T_N): self.g[i,:,:,0] = self.T_W[i]*T_value
        elif face == 'top':
            for i in range(self.T_N): self.g[i,:,:,-1] = self.T_W[i]*T_value

    def apply_thermal_bounce_back(self, solid_mask, T_wall=1.0):
        # Dirichlet (fixed-temperature) wall: solid nodes are held at
        # equilibrium for T_wall. This is an isothermal-wall boundary, not
        # an adiabatic/insulated one -- appropriate when the wall
        # temperature is known (e.g. a cooled surface), not when the wall
        # should be a zero-heat-flux boundary.
        for i in range(1, self.T_N): self.g[i][solid_mask] = self.T_W[i]*T_wall
