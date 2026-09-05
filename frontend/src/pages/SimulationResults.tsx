import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Cpu, Droplets, Gauge, Thermometer, Wind } from 'lucide-react';
import { FileAPI, SimulationAPI, getErrorMessage } from '../services/api';
import Viewer3D, { ResultField } from '../components/Viewer3D';
import { GeometryKind, getGeometryPreset } from '../data/geometryPresets';
import { GeometryRecord, MeshPreviewPayload } from '../types/geometry';
import { SimulationFieldSnapshot, SimulationRecord, SimulationResultsPayload } from '../types/simulation';

const FIELDS: Array<{ key: ResultField; label: string; caption: string; icon: typeof Wind }> = [
  { key: 'velocity', label: 'Velocidade', caption: 'Trajetórias e esteira', icon: Wind },
  { key: 'pressure', label: 'Pressão', caption: 'Isovalores no domínio', icon: Gauge },
  { key: 'temperature', label: 'Temperatura', caption: 'Convecção e difusão', icon: Thermometer },
];

const DISPERSION_FIELDS: Array<{ key: ResultField; label: string; caption: string; icon: typeof Wind }> = [
  { key: 'concentration', label: 'Concentração', caption: 'Pluma do gás liberado', icon: Droplets },
  { key: 'velocity', label: 'Vento', caption: 'Trajetórias e esteira', icon: Wind },
];

function valueOrDash(value: number | undefined, digits = 3) {
  if (value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

export default function SimulationResults() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sim, setSim] = useState<SimulationRecord | null>(null);
  const [results, setResults] = useState<SimulationResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [field, setField] = useState<ResultField | null>(null);
  const [requestError, setRequestError] = useState('');
  const [meshGeometry, setMeshGeometry] = useState<GeometryRecord | null>(null);
  const [meshPreview, setMeshPreview] = useState<MeshPreviewPayload | null>(null);

  // Synthetic presets (cylinder, Ahmed body...) have no Geometry row, so they
  // still rely on "?geo=" / localStorage to remember which illustrative
  // shape to render (set by SimulationNew.tsx). An imported geometry instead
  // resolves from the backend's own simulations.geometry_id column below --
  // that is the durable link the continuity requirement calls for.
  const presetGeoId = searchParams.get('geo') || (id ? localStorage.getItem(`mmx_sim_geometry:${id}`) : null);
  const selectedPreset = getGeometryPreset(presetGeoId);
  const hasImportedGeometry = !!sim?.geometry_id;
  const geometryKind: GeometryKind = hasImportedGeometry ? 'upload' : (selectedPreset?.kind || 'ahmed');
  const geometryLabel = hasImportedGeometry
    ? (meshGeometry?.original_filename || 'Geometria importada')
    : (selectedPreset?.name || 'Corpo de Ahmed');
  const isDispersion = sim?.results_summary?.scenario_type === 'gas_dispersion'
    || (id ? localStorage.getItem(`mmx_sim_scenario:${id}`) === 'gas_dispersion' : false);
  const fields = isDispersion ? DISPERSION_FIELDS : FIELDS;
  const activeField = field ?? fields[0].key;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const { data } = await SimulationAPI.get(id);
        if (cancelled) return;
        setSim(data);
        if (data.status === 'completed') {
          const { data: resultData } = await SimulationAPI.getResults(id);
          if (!cancelled) {
            setResults(resultData);
            setLoading(false);
          }
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          setLoading(false);
        } else {
          timer = setTimeout(poll, 2000);
        }
      } catch (error: any) {
        if (!cancelled) {
          setRequestError(getErrorMessage(error, 'Não foi possível carregar esta simulação.'));
          setLoading(false);
        }
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  // The imported mesh itself isn't part of the simulation/results payload --
  // once we know which Geometry this run used, fetch it (and its preview
  // mesh) the same way the upload/preparation screens do, so the results
  // viewer can render the exact same scenario instead of a stand-in shape.
  useEffect(() => {
    const geometryId = sim?.geometry_id;
    if (!geometryId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: record }, { data: preview }] = await Promise.all([
          FileAPI.get(geometryId),
          FileAPI.getPreview(geometryId),
        ]);
        if (!cancelled) {
          setMeshGeometry(record);
          setMeshPreview(preview);
        }
      } catch {
        // Geometry may lack a preview (e.g. a 2D drawing) or its file may be
        // gone from storage -- Viewer3D degrades to a bounds-only shape in
        // that case rather than fabricating a mesh.
      }
    })();
    return () => { cancelled = true; };
  }, [sim?.geometry_id]);

  const snapshot: Partial<SimulationFieldSnapshot> = (() => {
    if (!results) return {};
    if ('final' in results && results.final) return results.final;
    if ('field_snapshots' in results && results.field_snapshots.length) return results.field_snapshots[results.field_snapshots.length - 1];
    return {};
  })();
  const fieldStats = useMemo(() => {
    if (activeField === 'velocity') return [
      { label: 'Média', value: valueOrDash(snapshot.velocity_stats?.mean), unit: 'm/s' },
      { label: 'Máxima', value: valueOrDash(snapshot.velocity_stats?.max), unit: 'm/s' },
      { label: 'Amostra', value: snapshot.velocity_stats ? 'solver' : 'normalizada', unit: '' },
    ];
    if (activeField === 'pressure') return [
      { label: 'ρ mínima', value: valueOrDash(snapshot.rho_stats?.min, 5), unit: '' },
      { label: 'ρ média', value: valueOrDash(snapshot.rho_stats?.mean, 5), unit: '' },
      { label: 'ρ máxima', value: valueOrDash(snapshot.rho_stats?.max, 5), unit: '' },
    ];
    if (activeField === 'concentration') return [
      // Concentration reuses the thermal/scalar solver field (0=ar limpo,
      // 1=gás puro), shown here as a percentage.
      { label: 'Mínima', value: valueOrDash((snapshot.temperature_stats?.min ?? 0) * 100, 1), unit: '%' },
      { label: 'Média', value: valueOrDash((snapshot.temperature_stats?.mean ?? 0) * 100, 1), unit: '%' },
      { label: 'Máxima (no vazamento)', value: valueOrDash((snapshot.temperature_stats?.max ?? 0) * 100, 1), unit: '%' },
    ];
    return [
      { label: 'Mínima', value: valueOrDash(snapshot.temperature_stats?.min), unit: snapshot.temperature_stats ? '°C' : '' },
      { label: 'Média', value: valueOrDash(snapshot.temperature_stats?.mean), unit: snapshot.temperature_stats ? '°C' : '' },
      { label: 'Máxima', value: valueOrDash(snapshot.temperature_stats?.max), unit: snapshot.temperature_stats ? '°C' : '' },
    ];
  }, [activeField, snapshot]);

  if (loading && !sim) {
    return (
      <div className="results-loading" role="status">
        <div><strong>Localizando a simulação</strong><span>Consultando domínio, solver e último estado salvo.</span></div>
        <i><span /></i>
      </div>
    );
  }

  if (!sim) {
    return (
      <div className="results-error">
        <AlertTriangle size={24} />
        <h1>Resultado indisponível</h1>
        <p>{requestError || 'A simulação solicitada não foi encontrada.'}</p>
        <button type="button" className="btn-ghost" onClick={() => navigate('/')}>Voltar ao dashboard</button>
      </div>
    );
  }

  const progress = Math.max(0, Math.min(100, Math.round((sim.progress || 0) * 100)));
  return (
    <div className="results-page">
      <header className="results-header">
        <button type="button" onClick={() => navigate('/')} className="results-back" aria-label="Voltar ao dashboard"><ArrowLeft size={18} /></button>
        <div>
          <h1>{sim.name}</h1>
          <p><span>{sim.grid_size}</span><i />{sim.solver_type?.toUpperCase() || 'LBM D3Q19'}<i />{sim.gpu_used ? 'GPU CUDA' : 'CPU'}</p>
        </div>
        <div className={`results-status results-status--${sim.status}`}><span className="status-dot" />{sim.status === 'completed' ? 'Concluída' : sim.status === 'failed' ? 'Falhou' : 'Em execução'}</div>
      </header>

      {sim.status === 'completed' && results && (
        <>
          <section className="results-proof" aria-label="Resumo verificável da execução">
            <div><CheckCircle2 size={18} /><span>Convergência<strong>{results.converged ? 'Confirmada' : 'Não atingida'}</strong></span></div>
            <div><Clock3 size={18} /><span>Tempo físico<strong>{valueOrDash(results.compute_time, 2)} s</strong></span></div>
            <div><Activity size={18} /><span>Iterações<strong>{results.total_iterations?.toLocaleString('pt-BR') || '—'}</strong></span></div>
            <div><Cpu size={18} /><span>Processamento<strong>{results.gpu_used ? 'GPU CUDA' : 'CPU'}</strong></span></div>
          </section>

          <section className="results-workbench">
            <div className="results-workbench__top">
              <div><h2>{geometryLabel}</h2><p>Resultados tridimensionais · a geometria escolhida foi preservada.</p></div>
              <div className="results-field-tabs" role="tablist" aria-label="Campo físico exibido" style={fields.length < 3 ? { gridTemplateColumns: `repeat(${fields.length}, 1fr)` } : undefined}>
                {fields.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.key} type="button" role="tab" aria-selected={activeField === item.key} onClick={() => setField(item.key)}>
                      <Icon size={17} /><span><strong>{item.label}</strong><small>{item.caption}</small></span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Viewer3D
              field={activeField}
              simId={id}
              stats={snapshot}
              geometryKind={geometryKind}
              geometryLabel={geometryLabel}
              meshPreview={meshPreview}
              meshBounds={meshGeometry?.bounds ?? null}
            />

            <div className="field-measurements" aria-live="polite">
              <div className="field-measurements__name"><span>{fields.find((item) => item.key === activeField)?.label}</span><small>snapshot final · iteração {snapshot.iteration ?? results.total_iterations ?? '—'}</small></div>
              {fieldStats.map((stat) => <div key={stat.label}><span>{stat.label}</span><strong>{stat.value}<small>{stat.unit}</small></strong></div>)}
              <div className="field-measurements__proof"><span>Fonte</span><strong>{snapshot.velocity_stats || snapshot.rho_stats ? 'Solver LBM' : 'Visual normalizado'}</strong></div>
            </div>
          </section>
        </>
      )}

      {sim.status !== 'completed' && sim.status !== 'failed' && (
        <section className="execution-state" role="status">
          <div><Activity size={22} /><span><h2>Organizando o campo de resultados</h2><p>O solver está processando a grade. Esta tela será atualizada automaticamente.</p></span><strong>{progress}%</strong></div>
          <i><span style={{ transform: `scaleX(${progress / 100})` }} /></i>
          <footer><span>{sim.iterations_completed?.toLocaleString('pt-BR') || 0} iterações</span><span>{sim.grid_size}</span><span>Atualização a cada 2 s</span></footer>
        </section>
      )}

      {sim.status === 'failed' && (
        <section className="results-failed">
          <AlertTriangle size={24} />
          <div><h2>A execução foi interrompida</h2><p>{sim.error_message || 'O solver não concluiu esta simulação. Revise os parâmetros e tente novamente.'}</p></div>
          <button type="button" className="btn-ghost" onClick={() => navigate('/simulation/new')}>Revisar configuração</button>
        </section>
      )}
    </div>
  );
}
