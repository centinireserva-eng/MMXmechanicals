import numpy as np

# D3Q19 lattice (Qian, d'Humieres & Lallemand 1992): rest particle (1) +
# face neighbors (6) + edge diagonals (12) = 19 discrete velocities.
CX = np.array([0,1,-1,0,0,0,0,1,-1,1,-1,1,-1,1,-1,0,0,0,0])
CY = np.array([0,0,0,1,-1,0,0,1,1,-1,-1,0,0,0,0,1,-1,1,-1])
# Directions 16 and 17 (the y-z plane diagonals) had CZ=-1,+1 -- duplicating
# direction 15 = (0,1,1) at direction 17, and direction 18 = (0,-1,-1) at
# direction 16, while the other two y-z diagonals, (0,-1,1) and (0,1,-1),
# never appeared in the lattice at all. This broke the lattice's isotropy
# (sum(w_i*cy_i*cz_i) was 1/9 instead of the required 0) -- the y-z plane was
# structurally different from the x-y and x-z planes, invalidating the
# Chapman-Enskog derivation the whole method (and its stability) rests on.
# Fixed by swapping CZ[16] and CZ[17] so all four y-z sign combinations
# appear exactly once, matching the x-y and x-z diagonal planes.
CZ = np.array([0,0,0,0,0,1,-1,0,0,0,0,1,1,-1,-1,1,1,-1,-1])
W = np.array([1/3,1/18,1/18,1/18,1/18,1/18,1/18,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36,1/36])
# OPPOSITE[i] must be the direction with velocity -CX[i],-CY[i],-CZ[i] (used
# by bounce-back walls and the TRT collision operator's symmetric/
# antisymmetric split). The previous array swapped adjacent index PAIRS
# (7<->8, 9<->10, ...) for the 12 diagonal directions instead of mapping each
# to its true reverse (e.g. direction 7 = (1,1,0) was paired with direction 8
# = (-1,1,0), a 90-degree rotation, not the true opposite (-1,-1,0) =
# direction 10) -- silently breaking every solid-wall boundary and the TRT
# collision for all diagonal populations. Verified index-by-index below.
OPPOSITE = np.array([0,2,1,4,3,6,5,10,9,8,7,14,13,12,11,18,17,16,15])
NX = 19

# Verification (ASME V&V 20 / AIAA G-077 code-verification sense: does the
# implementation match its mathematical specification?), run once at import.
assert abs(W.sum() - 1.0) < 1e-12, "D3Q19 weights must sum to 1"
assert np.allclose(CX[OPPOSITE], -CX) and np.allclose(CY[OPPOSITE], -CY) and np.allclose(CZ[OPPOSITE], -CZ), \
    "OPPOSITE must map every direction to its exact reverse (c_i = -c_opposite(i))"
_directions = np.stack([CX, CY, CZ], axis=1)
assert len(np.unique(_directions, axis=0)) == NX, "all 19 lattice directions must be distinct"
_cross = {(a, b): (W * globals()[f"C{a.upper()}"] * globals()[f"C{b.upper()}"]).sum() for a, b in [("x", "y"), ("x", "z"), ("y", "z")]}
assert all(abs(v) < 1e-12 for v in _cross.values()), f"lattice must be isotropic: cross terms {_cross}"
assert abs((W * CX * CX).sum() - 1/3) < 1e-12, "lattice sound speed squared (cs^2) must be 1/3"
