import { useState } from 'react';
import { AlertCircle, Sparkles, Wand2 } from 'lucide-react';
import { FileAPI, getErrorMessage } from '../services/api';
import { DEFAULT_GEOMETRY_TRANSFORM, GeometryPrepareResult, GeometryRecord, GeometryTransform, LengthUnit, UpAxis } from '../types/geometry';

const UNITS: LengthUnit[] = ['mm', 'cm', 'm', 'in'];
const AXES: UpAxis[] = ['x', 'y', 'z'];

interface GeometryPreparationProps {
  geometry: GeometryRecord;
  onPrepared: (result: GeometryPrepareResult) => void;
}

export default function GeometryPreparation({ geometry, onPrepared }: GeometryPreparationProps) {
  const [transform, setTransform] = useState<GeometryTransform>({ ...DEFAULT_GEOMETRY_TRANSFORM, ...geometry.transformations });
  const [simplifyEnabled, setSimplifyEnabled] = useState(!!geometry.transformations?.simplify_target_faces);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);

  const update = <K extends keyof GeometryTransform>(key: K, value: GeometryTransform[K]) => setTransform((t) => ({ ...t, [key]: value }));

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      const payload: GeometryTransform = { ...transform, simplify_target_faces: simplifyEnabled ? transform.simplify_target_faces || 5000 : null };
      const { data } = await FileAPI.prepare(geometry.id, payload);
      setTransform(payload);
      setNotes(data.notes || []);
      onPrepared(data);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Nao foi possivel preparar a geometria. Tente novamente.'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="card space-y-4" aria-label="Preparação do cenário">
      <div className="flex items-center gap-2">
        <Wand2 size={17} className="text-mmx-accent" />
        <h2 className="section-title">Preparação do Cenário</h2>
      </div>
      <p className="text-xs text-mmx-muted -mt-2">
        Ajustes reais aplicados à malha antes da voxelização — a prévia 3D é recalculada a partir do arquivo original a cada "Aplicar".
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-mmx-muted block mb-1.5">Unidade do arquivo</label>
          <select value={transform.unit} onChange={(e) => update('unit', e.target.value as LengthUnit)} className="input-mmx">
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-mmx-muted block mb-1.5">Fator de escala manual</label>
          <input type="number" min={0.001} max={1000000} step={0.01} value={transform.scale}
            onChange={(e) => update('scale', Math.max(0.001, parseFloat(e.target.value) || 1))} className="input-mmx" />
        </div>
        <div>
          <label className="text-xs text-mmx-muted block mb-1.5">Eixo vertical do arquivo</label>
          <select value={transform.up_axis} onChange={(e) => update('up_axis', e.target.value as UpAxis)} className="input-mmx">
            {AXES.map((a) => <option key={a} value={a}>{a.toUpperCase()} {a === 'z' ? '(já correto)' : '→ Z'}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-mmx-muted block mb-1.5">Simplificar malha</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSimplifyEnabled((v) => !v)}
              className={`btn-ghost flex-1 text-xs ${simplifyEnabled ? 'text-mmx-accent' : ''}`}
              style={{ borderColor: simplifyEnabled ? 'rgba(140,255,112,.6)' : undefined }}>
              {simplifyEnabled ? 'Ativada' : 'Desativada'}
            </button>
          </div>
        </div>
      </div>

      {simplifyEnabled && (
        <div>
          <div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Triângulos alvo</label><span className="text-xs font-mono text-mmx-accent">{(transform.simplify_target_faces || 5000).toLocaleString('pt-BR')}</span></div>
          <input type="range" min={200} max={200000} step={100} value={transform.simplify_target_faces || 5000}
            onChange={(e) => update('simplify_target_faces', parseInt(e.target.value))} className="w-full accent-mmx-accent" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {(['rotate_x', 'rotate_y', 'rotate_z'] as const).map((axis, i) => (
          <div key={axis}>
            <div className="flex justify-between mb-1.5"><label className="text-xs text-mmx-muted">Rotação {['X', 'Y', 'Z'][i]}</label><span className="text-xs font-mono text-mmx-accent">{transform[axis]}°</span></div>
            <input type="range" min={-180} max={180} step={1} value={transform[axis]} onChange={(e) => update(axis, parseFloat(e.target.value))} className="w-full accent-mmx-accent" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => update('center_xy', !transform.center_xy)}
          className={`btn-ghost text-xs ${transform.center_xy ? 'text-mmx-accent' : ''}`} style={{ borderColor: transform.center_xy ? 'rgba(140,255,112,.6)' : undefined }}>
          Centralizar em X/Y
        </button>
        <button type="button" onClick={() => update('ground_align', !transform.ground_align)}
          className={`btn-ghost text-xs ${transform.ground_align ? 'text-mmx-accent' : ''}`} style={{ borderColor: transform.ground_align ? 'rgba(140,255,112,.6)' : undefined }}>
          Alinhar ao nível do solo
        </button>
        <button type="button" onClick={() => update('invert_normals', !transform.invert_normals)}
          className={`btn-ghost text-xs ${transform.invert_normals ? 'text-mmx-accent' : ''}`} style={{ borderColor: transform.invert_normals ? 'rgba(140,255,112,.6)' : undefined }}>
          Inverter normais
        </button>
      </div>

      {error && <div className="form-error" role="alert"><AlertCircle size={15} /> <span>{error}</span></div>}
      {notes.length > 0 && !error && (
        <div className="p-3 rounded-xl bg-mmx-elevated text-xs text-mmx-muted flex items-start gap-2">
          <Sparkles size={14} className="text-mmx-accent shrink-0 mt-0.5" />
          <ul className="space-y-1">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      <button type="button" onClick={handleApply} disabled={applying} className="btn-primary text-sm">
        {applying ? 'Aplicando…' : 'Aplicar preparação'}
      </button>
    </section>
  );
}
