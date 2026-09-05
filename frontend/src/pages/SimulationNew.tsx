import { useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, ChevronLeft, Play, Thermometer, Grid3x3, Gauge, FileBox, AlertCircle, Wind, Waves, Droplets } from 'lucide-react';
import { SimulationAPI, GeometryAPI, getErrorMessage } from '../services/api';
import GeometryPreview from '../components/GeometryPreview';
import { getGeometryPreset } from '../data/geometryPresets';
import { GAS_PRESETS, getGasPreset } from '../data/gasPresets';
import { ScenarioType, SimulationCreatePayload } from '../types/simulation';

interface UploadedGeometryState {
  geometryId: string;
  gridShape: number[];
  solidCells: number;
  fluidCells: number;
  sourceFile: string;
}

export default function SimulationNew() {
  const { t } = useTranslation(); const navigate = useNavigate(); const [params] = useSearchParams();
  const location = useLocation();
  // A geometry voxelized on the Upload de Arquivo screen arrives here as navigation
  // state (persisted Geometry id, already voxelized) instead of the
  // "?geo=<preset>" synthetic-preset-generation flow. The backend resolves the
  // grid from the Geometry row itself once geometry_id is sent -- see
  // routers/simulations.py::create_simulation -- so no grid path travels
  // through the frontend for this path.
  const navState = location.state as UploadedGeometryState | null;
  const uploadedGeometry = navState?.geometryId ? navState : null;
  const geoId = params.get('geo');
  const selectedPreset = getGeometryPreset(geoId);
  const [step, setStep] = useState(0); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  // Defaults sized for a quick first run: a 64^3 channel bounded by solid
  // walls needs a diffusive time of roughly (grid/2)^2/viscosity iterations
  // to actually reach steady state (~60k+ at nu=0.02) -- far more than any
  // reasonable iteration cap, so it always burned through the old
  // 10000-iteration budget without converging (measured: 176s for a result
  // that still says "did not converge"). 32^3 cuts that diffusive time 4x
  // (halved grid -> quartered), and 3000 iterations is enough headroom for
  // it to actually reach steady state instead of just running out the clock.
  const [config, setConfig] = useState(() => ({ name: selectedPreset ? `Sim · ${selectedPreset.name}` : `Sim_${Date.now().toString(36).slice(-6)}`, grid_size: uploadedGeometry ? Math.max(...uploadedGeometry.gridShape) : 32, viscosity: selectedPreset?.defaults.viscosity ?? 0.02, density: 1.0, inlet_velocity: selectedPreset?.defaults.inletVelocity ?? 0.1, max_iterations: 3000, turbulence_model: selectedPreset?.defaults.turbulenceModel ?? 'les', enable_thermal: selectedPreset?.defaults.enableThermal ?? false, thermal_diffusivity: 0.05, T_inlet: 1.0, T_wall: 0.0, boundary_conditions: selectedPreset?.kind === 'cavity' ? [{ face: 'west', type: 'wall' }, { face: 'east', type: 'wall' }, { face: 'south', type: 'wall' }, { face: 'north', type: 'velocity', params: { ux: 0.1, uy: 0, uz: 0 } }] : [{ face: 'west', type: 'velocity', params: { ux: selectedPreset?.defaults.inletVelocity ?? 0.1, uy: 0, uz: 0 } }, { face: 'east', type: 'outflow' }, { face: 'south', type: 'wall' }, { face: 'north', type: 'wall' }] }));
  // Gas dispersion is a distinct scenario, not just another physics toggle:
  // it drives buoyancy from the chosen gas's density relative to air and a
  // continuous leak source instead of the generic velocity-inlet setup.
  const [scenarioType, setScenarioType] = useState<ScenarioType>('generic');
  const [gasId, setGasId] = useState('methane');
  const gas = getGasPreset(gasId) || GAS_PRESETS[0];
  const [leakHeight, setLeakHeight] = useState(0.1); // fraction of domain height (z), 0=chão
  const [leakConcentration, setLeakConcentration] = useState(1.0);
  const [windSpeed, setWindSpeed] = useState(0.03);
  const reynolds = (config.inlet_velocity * config.grid_size) / config.viscosity;
  const handleRun = async () => {
    setLoading(true); setError('');
    try {
      // Only the synthetic-preset path needs a freshly generated grid: an
      // uploaded geometry already has its grid_path persisted on the
      // Geometry row, resolved server-side from geometry_id.
      let gridPath: string | null = null;
      if (!uploadedGeometry && geoId) { const { data } = await GeometryAPI.generate(geoId, config.grid_size); gridPath = data.grid_path; }
      const isDispersion = scenarioType === 'gas_dispersion';
      const basePayload: SimulationCreatePayload = {
        project_id: 'default', name: config.name,
        geometry_id: uploadedGeometry?.geometryId,
        grid_x: config.grid_size, grid_y: config.grid_size, grid_z: config.grid_size,
        grid_path: gridPath, async: false,
      };
      const payload: SimulationCreatePayload = isDispersion ? {
        ...basePayload,
        viscosity: Math.max(config.viscosity, 0.08), turbulence_model: 'none', max_iterations: config.max_iterations,
        scenario_type: 'gas_dispersion', gas_relative_density: gas.relativeDensity,
        leak_location: [0.15, 0.5, leakHeight], leak_radius_cells: Math.max(1, Math.round(config.grid_size * 0.03)),
        leak_concentration: leakConcentration,
        boundary_conditions: [
          { face: 'west', type: 'velocity', params: { ux: windSpeed, uy: 0, uz: 0 } },
          { face: 'east', type: 'outflow' },
          { face: 'bottom', type: 'wall' },
        ],
      } : {
        ...basePayload,
        viscosity: config.viscosity, density: config.density, inlet_velocity: config.inlet_velocity,
        max_iterations: config.max_iterations, turbulence_model: config.turbulence_model,
        enable_thermal: config.enable_thermal, thermal_diffusivity: config.thermal_diffusivity,
        T_inlet: config.T_inlet, T_wall: config.T_wall, boundary_conditions: config.boundary_conditions,
      };
      const { data } = await SimulationAPI.create(payload);
      // Uploaded geometries are now resolved from the backend's own
      // simulations.geometry_id column (see SimulationResults.tsx) -- no
      // localStorage/query-string linkage needed for that path. Synthetic
      // presets have no Geometry row, so they still rely on "?geo=" +
      // localStorage to remember which illustrative shape to render.
      if (geoId) localStorage.setItem(`mmx_sim_geometry:${data.simulation_id}`, geoId);
      if (isDispersion) localStorage.setItem(`mmx_sim_scenario:${data.simulation_id}`, 'gas_dispersion');
      navigate(geoId ? `/simulation/${data.simulation_id}?geo=${encodeURIComponent(geoId)}` : `/simulation/${data.simulation_id}`);
    } catch (err: any) {
      console.error(err);
      setError(getErrorMessage(err, 'Nao foi possivel executar a simulacao. Tente novamente.'));
    } finally { setLoading(false); }
  };
  const steps = scenarioType === 'gas_dispersion' ? ['Cenário', 'Vazamento', 'Vento', 'Revisão'] : ['Geometria', 'Fisica', 'Condicoes', 'Revisao'];
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">{t('simulation.new')}</h1>
      <div className="results-field-tabs max-w-md" style={{ gridTemplateColumns: '1fr 1fr' }} role="tablist" aria-label="Tipo de cenário">
        <button type="button" role="tab" aria-selected={scenarioType === 'generic'} onClick={() => { setScenarioType('generic'); setStep(0); }}>
          <Waves size={17} /><span><strong>Escoamento Genérico</strong><small>Velocidade, pressão, térmico</small></span>
        </button>
        <button type="button" role="tab" aria-selected={scenarioType === 'gas_dispersion'} onClick={() => { setScenarioType('gas_dispersion'); setStep(0); }}>
          <Droplets size={17} /><span><strong>Dispersão de Gás</strong><small>Vazamento, empuxo, vento</small></span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        {steps.map((s, i) => <div key={i} className="flex items-center flex-1">
          <div className={`flex items-center gap-2 ${i <= step ? 'text-mmx-accent' : 'text-mmx-muted'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? 'bg-mmx-accent text-mmx-bg' : i === step ? 'bg-mmx-accent/20 border-2 border-mmx-accent' : 'bg-mmx-surface border border-mmx-border'}`}>{i < step ? <Check size={14} /> : i + 1}</div>
            <span className="text-sm font-medium hidden sm:block">{s}</span>
          </div>
          {i < steps.length - 1 && <div className={`flex-1 h-px mx-2 ${i < step ? 'bg-mmx-accent' : 'bg-mmx-border'}`} />}
        </div>)}
      </div>
      <div className="card max-w-2xl">
        {scenarioType === 'gas_dispersion' ? (<>
        {step === 0 && <div className="space-y-4">
          <h2 className="section-title">Cenário</h2>
          <input type="text" value={config.name} onChange={e => setConfig({ ...config, name: e.target.value })} className="input-mmx" />
          <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Grade</label><span className="text-xs font-mono text-mmx-accent">{config.grid_size}^3</span></div><input type="range" min={16} max={64} step={8} value={config.grid_size} onChange={e => setConfig({ ...config, grid_size: parseInt(e.target.value) })} className="w-full accent-mmx-accent" /></div>
          <div className="p-3 rounded-xl bg-mmx-elevated flex items-center gap-3"><Grid3x3 size={18} className="text-mmx-accent-2" /><div><p className="text-xs text-mmx-muted">Células</p><p className="text-sm font-mono">{(config.grid_size ** 3).toLocaleString()}</p></div></div>
        </div>}
        {step === 1 && <div className="space-y-4">
          <h2 className="section-title">Vazamento</h2>
          <div>
            <label className="text-xs text-mmx-muted block mb-1.5">Gás liberado</label>
            <select value={gasId} onChange={e => setGasId(e.target.value)} className="input-mmx">
              {GAS_PRESETS.map(g => <option key={g.id} value={g.id}>{g.name} ({g.formula}) — {g.hazard}</option>)}
            </select>
          </div>
          <div className="p-3 rounded-xl bg-mmx-elevated flex items-center gap-3">
            <Droplets size={18} className={gas.relativeDensity < 1 ? 'text-mmx-accent' : 'text-mmx-warn'} />
            <div>
              <p className="text-xs text-mmx-muted">Densidade relativa ao ar</p>
              <p className="text-sm font-mono">{gas.relativeDensity.toFixed(3)} — {gas.relativeDensity < 1 ? 'mais leve, tende a subir' : 'mais pesado, tende a se acumular no chão'}</p>
            </div>
          </div>
          <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Altura do vazamento (fração do domínio)</label><span className="text-xs font-mono text-mmx-accent">{leakHeight === 0 ? 'Chão' : leakHeight >= 0.9 ? 'Teto' : `${Math.round(leakHeight * 100)}%`}</span></div><input type="range" min={0} max={1} step={0.05} value={leakHeight} onChange={e => setLeakHeight(parseFloat(e.target.value))} className="w-full accent-mmx-accent" /></div>
          <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Concentração no vazamento</label><span className="text-xs font-mono text-mmx-accent">{Math.round(leakConcentration * 100)}%</span></div><input type="range" min={0.1} max={1} step={0.05} value={leakConcentration} onChange={e => setLeakConcentration(parseFloat(e.target.value))} className="w-full accent-mmx-accent" /></div>
        </div>}
        {step === 2 && <div className="space-y-4">
          <h2 className="section-title">Vento</h2>
          <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Velocidade do vento</label><span className="text-xs font-mono text-mmx-accent">{windSpeed.toFixed(3)}</span></div><input type="range" min={0.005} max={0.08} step={0.005} value={windSpeed} onChange={e => setWindSpeed(parseFloat(e.target.value))} className="w-full accent-mmx-accent" /></div>
          <div className="p-3 rounded-xl bg-mmx-elevated flex items-center gap-3"><Wind size={18} className="text-mmx-accent-3" /><div><p className="text-xs text-mmx-muted">Direção</p><p className="text-sm font-mono">Oeste → Leste (única direção suportada por enquanto)</p></div></div>
          <p className="text-xs text-mmx-muted">O chão é tratado como parede sólida; o gás não atravessa o piso do domínio.</p>
        </div>}
        {step === 3 && <div className="space-y-4"><h2 className="section-title">Revisão</h2><div className="grid grid-cols-2 gap-3">{[["Nome", config.name], ["Gás", `${gas.name} (${gas.relativeDensity.toFixed(2)}x ar)`], ["Altura do vazamento", leakHeight === 0 ? 'Chão' : `${Math.round(leakHeight * 100)}%`], ["Concentração", `${Math.round(leakConcentration * 100)}%`], ["Vento", windSpeed.toFixed(3)], ["Grade", `${config.grid_size}^3`], ["Iterações", config.max_iterations]].map((r, i) => <div key={i} className="p-3 rounded-xl bg-mmx-elevated"><p className="text-xs text-mmx-muted">{r[0]}</p><p className="text-sm font-mono">{r[1]}</p></div>)}</div></div>}
        </>) : (<>
        {step === 0 && <div className="space-y-4">
          <h2 className="section-title">Geometria</h2>
          <input type="text" value={config.name} onChange={e => setConfig({ ...config, name: e.target.value })} className="input-mmx" />
          {selectedPreset && (
            <div className="selected-geometry">
              <div className="selected-geometry__scene"><GeometryPreview kind={selectedPreset.kind} active /></div>
              <div className="selected-geometry__info">
                <span>Modelo selecionado</span>
                <h3>{selectedPreset.name}</h3>
                <p>{selectedPreset.dimension} · {selectedPreset.category} · {selectedPreset.turbulence}</p>
                <strong>O mesmo objeto será mantido nos resultados 3D.</strong>
              </div>
            </div>
          )}
          {uploadedGeometry ? (
            <div className="p-3 rounded-xl bg-mmx-elevated space-y-3">
              <div className="flex items-center gap-3"><FileBox size={18} className="text-mmx-accent" /><div><p className="text-xs text-mmx-muted">Geometria importada</p><p className="text-sm font-mono truncate">{uploadedGeometry.sourceFile}</p></div></div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><p className="text-mmx-muted">Grade</p><p className="font-mono">{uploadedGeometry.gridShape.join(' x ')}</p></div>
                <div><p className="text-mmx-muted">Celulas solidas</p><p className="font-mono">{uploadedGeometry.solidCells.toLocaleString()}</p></div>
                <div><p className="text-mmx-muted">Celulas fluidas</p><p className="font-mono">{uploadedGeometry.fluidCells.toLocaleString()}</p></div>
              </div>
            </div>
          ) : (
            <>
              <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Grade</label><span className="text-xs font-mono text-mmx-accent">{config.grid_size}^3</span></div><input type="range" min={16} max={128} step={8} value={config.grid_size} onChange={e => setConfig({ ...config, grid_size: parseInt(e.target.value) })} className="w-full accent-mmx-accent" /></div>
              <div className="p-3 rounded-xl bg-mmx-elevated flex items-center gap-3"><Grid3x3 size={18} className="text-mmx-accent-2" /><div><p className="text-xs text-mmx-muted">Celulas</p><p className="text-sm font-mono">{(config.grid_size ** 3).toLocaleString()}</p></div></div>
            </>
          )}
        </div>}
        {step === 1 && <div className="space-y-4">
          <h2 className="section-title">Fisica</h2>
          <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Densidade</label><span className="text-xs font-mono text-mmx-accent">{config.density}</span></div><input type="range" min={0.1} max={10} step={0.1} value={config.density} onChange={e => setConfig({ ...config, density: parseFloat(e.target.value) })} className="w-full accent-mmx-accent" /></div>
          <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Viscosidade</label><span className="text-xs font-mono text-mmx-accent">{config.viscosity}</span></div><input type="range" min={0.001} max={0.1} step={0.001} value={config.viscosity} onChange={e => setConfig({ ...config, viscosity: parseFloat(e.target.value) })} className="w-full accent-mmx-accent" /></div>
          <div><div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Velocidade</label><span className="text-xs font-mono text-mmx-accent">{config.inlet_velocity}</span></div><input type="range" min={0.01} max={0.5} step={0.01} value={config.inlet_velocity} onChange={e => setConfig({ ...config, inlet_velocity: parseFloat(e.target.value) })} className="w-full accent-mmx-accent" /></div>
          <div className="flex gap-2">{(['none','les'] as const).map(m => <button key={m} onClick={() => setConfig({ ...config, turbulence_model: m })} className={`flex-1 py-2 rounded-lg text-xs font-medium ${config.turbulence_model === m ? 'bg-mmx-accent text-mmx-bg' : 'glass text-mmx-muted'}`}>{m === 'none' ? 'Laminar' : 'LES'}</button>)}</div>
          <div className="p-3 rounded-xl bg-mmx-elevated flex items-center gap-3"><Gauge size={18} className="text-mmx-accent-3" /><div><p className="text-xs text-mmx-muted">Reynolds</p><p className="text-sm font-mono text-mmx-accent-3">Re = {reynolds.toFixed(0)}</p></div></div>
          <button onClick={() => setConfig({ ...config, enable_thermal: !config.enable_thermal })} className="w-full flex items-center justify-between p-3 rounded-xl bg-mmx-surface border border-mmx-border"><div className="flex items-center gap-3"><Thermometer size={18} className={config.enable_thermal ? 'text-mmx-danger' : 'text-mmx-muted'} /><span className="text-sm">Analise Termica</span></div><div className={`w-10 h-6 rounded-full ${config.enable_thermal ? 'bg-mmx-accent' : 'bg-mmx-border'}`}><div className={`w-4 h-4 rounded-full bg-mmx-bg transition-transform ${config.enable_thermal ? 'translate-x-5' : 'translate-x-1'}`} /></div></button>
        </div>}
        {step === 2 && <div className="space-y-4"><h2 className="section-title">Condicoes de Contorno</h2>{config.boundary_conditions.map((bc, i) => <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-mmx-elevated"><span className="badge badge-queued">{bc.face}</span><span className="text-sm">{bc.type}</span></div>)}</div>}
        {step === 3 && <div className="space-y-4"><h2 className="section-title">Revisao</h2><div className="grid grid-cols-2 gap-3">{[["Nome", config.name], ["Geometria", selectedPreset?.name || uploadedGeometry?.sourceFile || 'Domínio padrão'], ["Grade", `${config.grid_size}^3`], ["Reynolds", reynolds.toFixed(0)], ["Iteracoes", config.max_iterations], ["Turbulencia", config.turbulence_model], ["Termico", config.enable_thermal ? 'Sim' : 'Nao']].map((r, i) => <div key={i} className="p-3 rounded-xl bg-mmx-elevated"><p className="text-xs text-mmx-muted">{r[0]}</p><p className="text-sm font-mono">{r[1]}</p></div>)}</div></div>}
        </>)}
      </div>
      {error && <div className="max-w-2xl flex items-center gap-2 p-3 rounded-xl bg-mmx-danger/10 text-mmx-danger text-sm"><AlertCircle size={16} className="shrink-0" /> {error}</div>}
      {loading && <div className="max-w-2xl flex items-center gap-2 p-3 rounded-xl bg-mmx-accent-2/10 text-mmx-accent-2 text-sm"><div className="w-4 h-4 rounded-full border-2 border-mmx-accent-2/30 border-t-mmx-accent-2 animate-spin shrink-0" /> Calculando... grades e numeros de iteracoes maiores podem levar alguns minutos.</div>}
      <div className="flex justify-between max-w-2xl">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-30"><ChevronLeft size={16} /> Voltar</button>
        {step < 3 ? <button onClick={() => setStep(step + 1)} className="btn-primary flex items-center gap-2 text-sm">Proximo <ChevronRight size={16} /></button> : <button onClick={handleRun} disabled={loading} className="btn-primary flex items-center gap-2 text-sm">{loading ? <div className="w-4 h-4 rounded-full border-2 border-mmx-bg/30 border-t-mmx-bg animate-spin" /> : <Play size={16} />} Executar</button>}
      </div>
    </div>
  );
}
