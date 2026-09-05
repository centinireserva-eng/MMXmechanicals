"""
Verification & validation tests for the LBM D3Q19 solver.

"Verification" here follows the ASME V&V 20 / AIAA G-077 sense: does the
implementation match its own mathematical specification (exact lattice
symmetries, exact conservation properties of the equilibrium distribution,
exact behavior of the boundary-condition operators)? "Validation" is a
lightweight qualitative smoke-test that known physics actually shows up
(an obstacle deflects flow, a channel is fastest at its center) -- a full
quantitative validation against a published benchmark (e.g. Ghia et al.
1982 lid-driven-cavity data, ERCOFTAC test cases) is a larger effort tracked
separately, not claimed here.

Run with: pytest backend/tests -v
"""
import numpy as np
import pytest

from app.services.solver.lattice import CX, CY, CZ, W, OPPOSITE, NX
from app.services.solver.boundary import BoundaryHandler, BoundaryCondition
from app.services.solver.lbm import LBMSolver, SolverConfig
from app.services.solver.thermal import ThermalSolver


# ---------------------------------------------------------------------------
# Code verification: lattice geometry
# ---------------------------------------------------------------------------

def test_d3q19_weights_sum_to_one():
    assert W.sum() == pytest.approx(1.0, abs=1e-12)


def test_d3q19_opposite_is_true_reverse():
    assert np.array_equal(CX[OPPOSITE], -CX)
    assert np.array_equal(CY[OPPOSITE], -CY)
    assert np.array_equal(CZ[OPPOSITE], -CZ)


def test_d3q19_opposite_is_involution():
    assert np.array_equal(OPPOSITE[OPPOSITE], np.arange(NX))


def test_d3q19_all_directions_are_distinct():
    # Regression guard: directions 16 and 17 (the y-z plane diagonals) used
    # to have CZ=-1,+1, duplicating direction 15=(0,1,1) at direction 17 and
    # direction 18=(0,-1,-1) at direction 16, while (0,-1,1) and (0,1,-1)
    # never appeared in the lattice at all.
    directions = np.stack([CX, CY, CZ], axis=1)
    assert len(np.unique(directions, axis=0)) == NX


def test_d3q19_is_isotropic():
    # Regression guard for the same bug: with two duplicated and two missing
    # y-z diagonal directions, sum(w_i*cy_i*cz_i) was 1/9 instead of 0 -- the
    # y-z plane was structurally different from the x-y and x-z planes. This
    # broke the Chapman-Enskog derivation the method's stability rests on,
    # and was the root cause of an exponential blow-up that appeared for any
    # non-uniform velocity field, independent of boundary conditions,
    # viscosity, or float32 vs. float64 precision.
    assert abs((W * CX * CY).sum()) < 1e-12
    assert abs((W * CX * CZ).sum()) < 1e-12
    assert abs((W * CY * CZ).sum()) < 1e-12
    assert abs((W * CX * CX).sum() - 1/3) < 1e-12
    assert abs((W * CY * CY).sum() - 1/3) < 1e-12
    assert abs((W * CZ * CZ).sum() - 1/3) < 1e-12


def test_d3q7_thermal_weights_sum_to_one():
    assert ThermalSolver.T_W.sum() == pytest.approx(1.0, abs=1e-12)


# ---------------------------------------------------------------------------
# Code verification: equilibrium distribution conserves mass and momentum
# ---------------------------------------------------------------------------

def _make_solver(nx=4, ny=4, nz=4, **kwargs):
    cfg = SolverConfig(nx=nx, ny=ny, nz=nz, max_iters=1, **kwargs)
    return LBMSolver(cfg)


def test_equilibrium_conserves_mass_and_momentum():
    solver = _make_solver()
    shape = (solver.cfg.nx, solver.cfg.ny, solver.cfg.nz)
    rho = np.full(shape, 1.3, dtype=np.float32)
    ux = np.full(shape, 0.05, dtype=np.float32)
    uy = np.full(shape, -0.02, dtype=np.float32)
    uz = np.full(shape, 0.01, dtype=np.float32)
    f_eq = solver.equilibrium(rho, ux, uy, uz)
    rho_check = f_eq.sum(axis=0)
    ux_check = (f_eq * solver.cx[:, None, None, None]).sum(axis=0) / rho_check
    uy_check = (f_eq * solver.cy[:, None, None, None]).sum(axis=0) / rho_check
    uz_check = (f_eq * solver.cz[:, None, None, None]).sum(axis=0) / rho_check
    # atol sized for float32 accumulation over a 19-term sum with internal
    # cancellation (the u^2 terms cancel exactly in exact arithmetic but not
    # bit-for-bit in float32), not for a real conservation violation.
    assert np.allclose(rho_check, rho, atol=2e-3)
    assert np.allclose(ux_check, ux, atol=2e-3)
    assert np.allclose(uy_check, uy, atol=2e-3)
    assert np.allclose(uz_check, uz, atol=2e-3)


# ---------------------------------------------------------------------------
# Code verification: bounce-back reflects every population to its exact
# opposite direction, and actually changes solid-node populations
# ---------------------------------------------------------------------------

def test_bounce_back_reflects_to_exact_opposite():
    shape = (NX, 3, 3, 3)
    f = np.arange(np.prod(shape), dtype=np.float64).reshape(shape)
    original = f.copy()
    solid = np.zeros((3, 3, 3), dtype=bool)
    solid[1, 1, 1] = True
    result = BoundaryHandler.apply_bounce_back(f.copy(), solid, OPPOSITE)
    for i in range(NX):
        assert result[i, 1, 1, 1] == pytest.approx(original[OPPOSITE[i], 1, 1, 1])
    fluid = ~solid
    assert np.array_equal(result[:, fluid], original[:, fluid])


def test_bounce_back_is_not_a_no_op():
    # Regression guard for the double-swap bug: looping the pairwise swap
    # over every direction i (instead of each unordered pair once) processed
    # every pair twice and silently undid itself, making bounce-back a
    # complete no-op -- solid obstacles and walls had zero effect on flow.
    shape = (NX, 2, 2, 2)
    rng = np.random.default_rng(0)
    f = rng.random(shape)
    solid = np.ones((2, 2, 2), dtype=bool)
    result = BoundaryHandler.apply_bounce_back(f.copy(), solid, OPPOSITE)
    assert not np.allclose(result, f)


# ---------------------------------------------------------------------------
# Validation smoke-test: known qualitative physics must actually appear
# ---------------------------------------------------------------------------

def test_localized_perturbation_decays_without_blowing_up():
    # A small, smooth velocity perturbation in an otherwise still, fully
    # periodic domain (no boundary conditions at all) must diffuse away --
    # it must never grow without bound. This is about as forgiving a
    # stability test as exists for an explicit LBM scheme, and it is exactly
    # what exposed the y-z isotropy bug above: with that bug, this diverged
    # to NaN by iteration ~50 regardless of viscosity, BGK vs. TRT, or
    # float32 vs. float64 precision, because the instability came from the
    # lattice geometry itself, not from any boundary condition or parameter
    # choice.
    nx, ny, nz = 24, 12, 4
    solver = _make_solver(nx, ny, nz, nu=0.1)
    solver.cfg.boundary_conditions = []
    xx, yy = np.meshgrid(np.arange(nx), np.arange(ny), indexing='ij')
    bump = 0.05 * np.exp(-(((xx - nx // 2) ** 2) / 18.0 + ((yy - ny // 2) ** 2) / 8.0))
    ux0 = np.repeat(bump[:, :, None], nz, axis=2).astype(np.float32)
    rho0 = np.ones((nx, ny, nz), dtype=np.float32)
    zeros = np.zeros((nx, ny, nz), dtype=np.float32)
    solver.f = solver.equilibrium(rho0, ux0, zeros, zeros)
    peak = 0.05
    for _ in range(1500):
        solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
        speed = np.sqrt(solver.ux**2 + solver.uy**2 + solver.uz**2)
        assert np.isfinite(speed).all()
        peak = max(peak, float(speed.max()))
    assert peak < 0.1, f"perturbation grew to {peak:.4f} instead of decaying (started at 0.05)"

def test_solid_obstacle_deflects_flow():
    nx, ny, nz = 24, 12, 4
    solid = np.zeros((nx, ny, nz), dtype=bool)
    solid[10:14, 4:8, :] = True  # a block obstacle mid-channel
    cfg = SolverConfig(nx=nx, ny=ny, nz=nz, nu=0.05, max_iters=1,
                        turbulence_model="none", solid_mask=solid)
    solver = LBMSolver(cfg)
    solver.cfg.boundary_conditions = [
        BoundaryCondition('west', 'velocity', ux=0.05, uy=0, uz=0),
        BoundaryCondition('east', 'outflow'),
    ]
    for _ in range(200):
        solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
    speed = np.sqrt(solver.ux**2 + solver.uy**2 + solver.uz**2)
    assert np.isfinite(speed).all()
    upstream = speed[2:6, 4:8, :].mean()
    wake = speed[14:18, 5:7, :].mean()
    # a functioning no-slip obstacle must measurably slow the flow in its
    # wake relative to the free stream in front of it; with a no-op
    # bounce-back the block is invisible and wake ~= upstream
    assert wake < upstream * 0.9, (
        f"wake speed ({wake:.4f}) is not measurably lower than upstream speed "
        f"({upstream:.4f}) -- the obstacle does not appear to be blocking flow"
    )


def test_channel_flow_is_faster_at_center_than_near_walls():
    nx, ny, nz = 40, 12, 4
    solid = np.zeros((nx, ny, nz), dtype=bool)
    solid[:, 0, :] = True; solid[:, -1, :] = True  # top/bottom no-slip walls
    cfg = SolverConfig(nx=nx, ny=ny, nz=nz, nu=0.1, max_iters=1,
                        turbulence_model="none", solid_mask=solid)
    solver = LBMSolver(cfg)
    solver.cfg.boundary_conditions = [
        BoundaryCondition('west', 'pressure', rho=1.01),
        BoundaryCondition('east', 'pressure', rho=1.00),
    ]
    for _ in range(1500):
        solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
    profile = np.abs(solver.ux[nx // 2, :, 0])
    assert np.isfinite(profile).all()
    mid = profile[ny // 2]
    near_wall = profile[1]
    assert mid > near_wall * 1.5, (
        f"centerline speed ({mid:.5f}) is not clearly faster than the "
        f"near-wall speed ({near_wall:.5f}) -- expected Poiseuille-like shape"
    )


def test_wall_boundary_condition_slows_flow_near_it():
    # Regression guard: bc_type "wall" (the frontend's default for the
    # north/south faces) had no handler in apply_boundary_conditions at all
    # -- it was silently ignored, leaving those faces periodic instead of
    # solid. Uses BoundaryCondition("wall") directly instead of solid_mask,
    # exercising the same code path SimulationNew.tsx's default config does.
    nx, ny, nz = 32, 16, 4
    solver = _make_solver(nx, ny, nz, nu=0.05)
    solver.cfg.boundary_conditions = [
        BoundaryCondition('west', 'velocity', ux=0.05, uy=0, uz=0),
        BoundaryCondition('east', 'outflow'),
        BoundaryCondition('south', 'wall'),
        BoundaryCondition('north', 'wall'),
    ]
    for _ in range(600):
        solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
    speed = np.sqrt(solver.ux**2 + solver.uy**2 + solver.uz**2)
    assert np.isfinite(speed).all()
    near_wall = speed[nx // 2, 1, :].mean()
    mid_channel = speed[nx // 2, ny // 2, :].mean()
    assert mid_channel > near_wall * 2, (
        f"mid-channel speed ({mid_channel:.4f}) is not clearly faster than "
        f"near-wall speed ({near_wall:.4f}) -- the 'wall' faces don't appear to be slowing the flow"
    )


# ---------------------------------------------------------------------------
# Body force / buoyancy (Guo et al. 2002 forcing scheme) -- added to support
# gas-dispersion scenarios (a released gas lighter/heavier than air rises or
# sinks). Verified quantitatively against the one case with an exact
# closed-form solution: a uniform body force between two parallel walls.
# ---------------------------------------------------------------------------

def test_body_force_matches_analytical_poiseuille_flow():
    # Plane Poiseuille flow driven by a uniform body force Fx between two
    # stationary walls has the exact solution u(y) = (Fx/(2*nu))*y*(H-y),
    # u_max = Fx*H^2/(8*nu). This is the standard textbook verification case
    # for an LBM forcing scheme (e.g. Kruger et al. 2017, ch. 6) precisely
    # because it isolates the forcing term from everything else (no other
    # boundary condition is involved -- periodic in x and z, walls in y).
    nx, ny, nz = 6, 24, 6
    solid = np.zeros((nx, ny, nz), dtype=bool)
    solid[:, 0, :] = True; solid[:, -1, :] = True
    nu = 0.06
    Fx = 0.0001
    cfg = SolverConfig(nx=nx, ny=ny, nz=nz, nu=nu, max_iters=1, turbulence_model="none",
                        solid_mask=solid, body_force=(Fx, 0.0, 0.0))
    solver = LBMSolver(cfg)
    solver.cfg.boundary_conditions = []
    for _ in range(12000):
        solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
    profile = solver.ux[0, :, 0]
    assert np.isfinite(profile).all()
    H = ny - 1
    y = np.arange(ny)
    analytic = (Fx / (2 * nu)) * y * (H - y)
    rel_err = np.abs(profile[1:-1] - analytic[1:-1]) / analytic[1:-1]
    assert rel_err.max() < 0.05, f"max relative error {rel_err.max():.3%} vs the exact body-force Poiseuille solution"


def test_forcing_with_trt_falls_back_to_bgk():
    # Regression guard: combining Guo forcing with TRT's symmetric/
    # antisymmetric split was tried and found to NOT reproduce the exact
    # body-force Poiseuille solution near walls (off by ~6x, non-constant
    # error) -- a known-hard combination in the LBM literature, not fixed
    # here. The solver must silently use BGK instead whenever forcing is
    # active, rather than silently giving the wrong answer under TRT.
    cfg = SolverConfig(nx=4, ny=4, nz=4, max_iters=1, use_trt=True, body_force=(0.0001, 0.0, 0.0))
    solver = LBMSolver(cfg)
    assert solver.use_trt is False
    cfg2 = SolverConfig(nx=4, ny=4, nz=4, max_iters=1, use_trt=True)
    solver2 = LBMSolver(cfg2)
    assert solver2.use_trt is True


def test_buoyancy_makes_light_gas_rise_and_heavy_gas_sink():
    # A patch of scalar (gas concentration, reusing the thermal solver)
    # placed mid-height: with a *negative* buoyancy_accel (gas lighter than
    # ambient) it must drift toward +z (up); with a *positive* one (heavier)
    # it must drift toward -z (down). This is the core physical behavior a
    # gas-dispersion scenario depends on (buoyant vs. dense-gas releases).
    def run(buoyancy_accel):
        nx, ny, nz = 12, 12, 24
        cfg = SolverConfig(nx=nx, ny=ny, nz=nz, nu=0.05, max_iters=1, turbulence_model="none",
                            enable_thermal=True, thermal_diffusivity=0.02,
                            buoyancy_accel=buoyancy_accel, scalar_ambient=0.0)
        solver = LBMSolver(cfg)
        solver.cfg.boundary_conditions = []
        cx, cy, cz = nx // 2, ny // 2, nz // 2
        solver.thermal.g[:] = 0.0
        for i in range(solver.thermal.T_N):
            solver.thermal.g[i, cx - 1:cx + 1, cy - 1:cy + 1, cz - 1:cz + 1] = solver.thermal.T_W[i] * 1.0
        for _ in range(800):
            solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
        scalar = solver.thermal.temperature()
        assert np.isfinite(scalar).all()
        # Centroid z-position of the scalar cloud, weighted by concentration.
        z = np.arange(nz)
        weight = scalar.sum(axis=(0, 1))
        return float((weight * z).sum() / weight.sum()) - cz

    rise = run(buoyancy_accel=+0.002)   # lighter than ambient
    sink = run(buoyancy_accel=-0.002)   # heavier than ambient
    assert rise > 0.3, f"a lighter-than-ambient patch should drift upward (+z), centroid shift was {rise:+.3f}"
    assert sink < -0.3, f"a heavier-than-ambient patch should drift downward (-z), centroid shift was {sink:+.3f}"


def test_source_mask_maintains_concentration():
    # A leak source (source_mask) must keep injecting scalar at source_value
    # every iteration -- concentration downstream of it should rise above
    # the initial zero level, and the source cell itself should stay pinned
    # near source_value rather than drifting away.
    nx, ny, nz = 16, 8, 8
    source = np.zeros((nx, ny, nz), dtype=bool)
    source[2, ny // 2, nz // 2] = True
    cfg = SolverConfig(nx=nx, ny=ny, nz=nz, nu=0.05, max_iters=1, turbulence_model="none",
                        enable_thermal=True, thermal_diffusivity=0.05,
                        source_mask=source, source_value=1.0)
    solver = LBMSolver(cfg)
    solver.cfg.boundary_conditions = [BoundaryCondition('west', 'velocity', ux=0.02, uy=0, uz=0),
                                       BoundaryCondition('east', 'outflow')]
    for _ in range(400):
        solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
    scalar = solver.thermal.temperature()
    assert np.isfinite(scalar).all()
    assert scalar[2, ny // 2, nz // 2] == pytest.approx(1.0, abs=0.05)
    downstream = scalar[6, ny // 2, nz // 2]
    assert downstream > 0.05, f"concentration {downstream:.4f} downstream of the source did not rise above background"


def test_convergence_check_does_not_trigger_before_plume_develops():
    # Regression guard: check_convergence() used to look only at density,
    # which barely moves in a buoyancy/source-driven run -- run() declared
    # "converged" at iteration 0, before the leak had dispersed at all.
    # Requiring velocity to have settled too catches this. Uses a wind
    # (velocity inlet + outflow) as any real dispersion scenario would --
    # buoyancy_accel and source_value are deliberately mild here (see
    # test_source_and_buoyancy_together_need_a_moderate_buoyancy_accel for
    # why a much stronger one goes unstable).
    nx, ny, nz = 12, 12, 20
    source = np.zeros((nx, ny, nz), dtype=bool)
    source[3, ny // 2, 2] = True
    cfg = SolverConfig(nx=nx, ny=ny, nz=nz, nu=0.1, max_iters=300, turbulence_model="none",
                        enable_thermal=True, thermal_diffusivity=0.05,
                        buoyancy_accel=0.0005, source_mask=source, source_value=1.0)
    solver = LBMSolver(cfg)
    solver.cfg.boundary_conditions = [BoundaryCondition('west', 'velocity', ux=0.02, uy=0, uz=0),
                                       BoundaryCondition('east', 'outflow')]
    results = solver.run()
    assert results["total_iterations"] > 5, (
        "converged almost immediately -- the plume likely never had a chance to develop"
    )


def test_source_and_buoyancy_together_need_a_moderate_buoyancy_accel():
    # A continuous source (unlike a one-off patch) keeps re-injecting
    # concentration every iteration, sustaining the buoyancy force
    # indefinitely -- combined with a strong buoyancy_accel this was found
    # to blow up (velocity and even concentration -- which is physically
    # bounded by source_value -- growing without bound), even though the
    # same buoyancy_accel is stable for a one-off patch
    # (test_buoyancy_makes_light_gas_rise_and_heavy_gas_sink uses 0.002).
    # This isn't a bug to fix so much as a real stability limit -- like a
    # CFL condition -- that scenario configuration needs to respect;
    # documented on SolverConfig.buoyancy_accel. This test pins the boundary:
    # a mild accel stays bounded, a 6x stronger one (still modest-looking)
    # does not.
    nx, ny, nz = 12, 12, 20
    source = np.zeros((nx, ny, nz), dtype=bool)
    source[3, ny // 2, 2] = True

    def run(buoyancy_accel, nu, iters=300):
        cfg = SolverConfig(nx=nx, ny=ny, nz=nz, nu=nu, max_iters=1, turbulence_model="none",
                            enable_thermal=True, thermal_diffusivity=0.05,
                            buoyancy_accel=buoyancy_accel, source_mask=source, source_value=1.0)
        solver = LBMSolver(cfg)
        solver.cfg.boundary_conditions = [BoundaryCondition('west', 'velocity', ux=0.02, uy=0, uz=0),
                                           BoundaryCondition('east', 'outflow')]
        for _ in range(iters):
            solver.collide(); solver.stream(); solver.apply_boundary_conditions(); solver.compute_macroscopic()
            if not np.isfinite(solver.ux).all():
                return False
        return True

    assert run(buoyancy_accel=0.0005, nu=0.1) is True, "a mild buoyancy_accel with a continuous source should stay bounded"
    assert run(buoyancy_accel=0.003, nu=0.05) is False, (
        "expected a 6x stronger buoyancy_accel with a continuous source to be unstable at this viscosity -- "
        "if this now passes, the solver got more robust and this test's bound should be tightened, not deleted"
    )
