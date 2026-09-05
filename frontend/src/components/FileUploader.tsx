import { DragEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, Box, Check, FileBox, FolderOpen, Grid3X3, Info, Ruler, X } from 'lucide-react';
import { FileAPI, getErrorMessage } from '../services/api';
import GeometryPreview from './GeometryPreview';
import MeshPreview from './MeshPreview';
import GeometryPreparation from './GeometryPreparation';
import { GeometryPrepareResult, GeometryUploadResult } from '../types/geometry';

const GRID_STEPS = [16, 32, 64, 128, 256, 512];
const FORMATS = [
  { label: 'STL', detail: 'malha 3D', tone: 'green' },
  { label: 'OBJ', detail: 'malha 3D', tone: 'cyan' },
  { label: 'PLY', detail: 'malha 3D', tone: 'cyan' },
  { label: 'GLB/GLTF', detail: 'malha 3D', tone: 'cyan' },
  { label: 'STEP', detail: 'sólido 3D', tone: 'blue' },
  { label: 'DXF', detail: 'desenho 2D', tone: 'amber' },
] as const;

function DataRow({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return <div className="upload-data-row"><span>{label}</span><strong className={good ? 'text-mmx-accent' : ''}>{value}</strong></div>;
}

export default function FileUploader() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voxelizing, setVoxelizing] = useState(false);
  const [geometry, setGeometry] = useState<GeometryUploadResult | GeometryPrepareResult | null>(null);
  const [gridStep, setGridStep] = useState(2);
  const [fillInterior, setFillInterior] = useState(true);
  const [error, setError] = useState('');

  const resolution = GRID_STEPS[gridStep];
  const totalCells = resolution ** 3;
  const is3D = geometry?.dimension === '3D';

  const handleFile = async (file: File) => {
    setUploading(true);
    setError('');
    setGeometry(null);
    try {
      const { data } = await FileAPI.upload(file);
      setGeometry(data);
    } catch (err: any) {
      setError(getErrorMessage(err, t('errors.unsupportedFormat')));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleVoxelize = async () => {
    if (!geometry) return;
    setVoxelizing(true);
    setError('');
    try {
      const { data } = await FileAPI.voxelize(geometry.id, resolution, fillInterior);
      navigate('/simulation/new', { state: {
        geometryId: geometry.id,
        gridShape: data.grid_shape,
        solidCells: data.solid_cells,
        fluidCells: data.fluid_cells,
        sourceFile: geometry.original_filename,
      } });
    } catch (err: any) {
      setError(getErrorMessage(err, 'A voxelização não foi concluída. Verifique a malha e tente novamente.'));
    } finally {
      setVoxelizing(false);
    }
  };

  return (
    <div className="upload-flow">
      <div
        className={`upload-dropzone ${dragging ? 'is-dragging' : ''} ${uploading ? 'is-processing' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
        onDrop={handleDrop}
      >
        <input ref={inputRef} type="file" accept=".stl,.obj,.ply,.glb,.gltf,.step,.stp,.iges,.igs,.dxf" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} className="sr-only" />
        <div className="upload-dropzone__copy">
          <span className="upload-icon"><FileBox size={27} /></span>
          <h2>{dragging ? 'Solte para inspecionar a geometria' : uploading ? 'Organizando a malha…' : 'Arraste e solte o arquivo aqui'}</h2>
          <p>{uploading ? 'Validando topologia, escala e caixa envolvente.' : 'A geometria será validada antes da configuração do solver.'}</p>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-ghost">
            <FolderOpen size={17} /> {uploading ? 'Analisando arquivo' : 'Procurar arquivo'}
          </button>
          {uploading && <div className="mesh-scan" role="progressbar" aria-label="Analisando geometria"><span /></div>}
        </div>
        <div className="upload-dropzone__scene">
          <GeometryPreview kind={dragging || uploading ? 'voxel' : 'upload'} active={dragging || uploading} />
          <div className="axis-labels" aria-hidden="true"><span>X</span><span>Y</span><span>Z</span></div>
        </div>
      </div>

      <div className="format-strip" aria-label="Formatos suportados">
        <span>Formatos suportados</span>
        {FORMATS.map((format) => <div key={format.label} className={`format-token format-token--${format.tone}`}><Box size={13} /><strong>{format.label}</strong><small>{format.detail}</small></div>)}
      </div>

      {error && <div className="form-error upload-error" role="alert"><AlertCircle size={17} /> <span>{error}</span></div>}

      {geometry && (
        <section className="upload-inspection" aria-label="Inspeção do arquivo enviado">
          <div className="upload-file-summary">
            <span className="upload-success-mark"><Check size={22} /></span>
            <div className="min-w-0">
              <h2>{geometry.original_filename}</h2>
              <div className="geometry-tags">
                <span>{geometry.format}</span><span>{geometry.dimension}</span>
                {'size_mb' in geometry && <span>{geometry.size_mb} MB</span>}
              </div>
              <strong>Upload concluído com sucesso</strong>
              <p>Arquivo verificado e pronto para processamento.</p>
            </div>
            <button type="button" onClick={() => setGeometry(null)} className="remove-upload" aria-label="Remover arquivo"><X size={16} /></button>
          </div>

          <div className="upload-data-block">
            <h3><Grid3X3 size={16} />{is3D ? t('geometry.meshInfo') : t('geometry.drawingInfo')}</h3>
            {is3D ? <>
              <DataRow label={t('geometry.triangles')} value={(geometry.face_count ?? 0).toLocaleString('pt-BR')} />
              <DataRow label={t('geometry.vertices')} value={(geometry.vertex_count ?? 0).toLocaleString('pt-BR')} />
              <DataRow label={t('geometry.normals')} value={geometry.normals_consistent ? t('geometry.consistent') : t('geometry.inconsistent')} good={!!geometry.normals_consistent} />
              <DataRow label="Malha fechada" value={geometry.watertight ? 'Sim (watertight)' : 'Não (aberta)'} good={!!geometry.watertight} />
            </> : <DataRow label={t('geometry.entities')} value="não informado" />}
          </div>

          <div className="upload-data-block">
            <h3><Ruler size={16} />{t('geometry.boundingBox')}</h3>
            {geometry.bounds ? <>
              <DataRow label={`X (${geometry.units})`} value={geometry.bounds.size[0].toFixed(2)} />
              <DataRow label={`Y (${geometry.units})`} value={geometry.bounds.size[1].toFixed(2)} />
              {is3D && <DataRow label={`Z (${geometry.units})`} value={geometry.bounds.size[2].toFixed(2)} />}
            </> : <DataRow label="Caixa envolvente" value="não detectado" />}
            <DataRow label={t('geometry.unit')} value={geometry.units} />
          </div>

          <div className="upload-model-preview"><MeshPreview preview={geometry.preview} size={is3D && geometry.bounds ? { x: geometry.bounds.size[0], y: geometry.bounds.size[1], z: geometry.bounds.size[2] } : null} /></div>
        </section>
      )}

      {geometry && is3D && (
        <GeometryPreparation geometry={geometry} onPrepared={(result) => setGeometry(result)} />
      )}

      {geometry && (
        <section className="voxel-panel">
          <div className="voxel-panel__control">
            <div className="voxel-title"><Grid3X3 size={17} /><h2>Configurações de Malha <span>(Voxel)</span></h2><strong>{resolution}³</strong></div>
            <input type="range" min={0} max={GRID_STEPS.length - 1} step={1} value={gridStep} onChange={(event) => setGridStep(Number(event.target.value))} aria-label="Tamanho da grade" />
            <div className="voxel-scale">{GRID_STEPS.map((value, index) => <span key={value} className={index === gridStep ? 'is-active' : ''}>{value}³</span>)}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setFillInterior(true)} className="btn-ghost" style={{ flex: 1, fontSize: 10, borderColor: fillInterior ? 'rgba(140,255,112,.6)' : undefined, color: fillInterior ? 'var(--mmx-green)' : undefined }}>
                Objeto sólido
              </button>
              <button type="button" onClick={() => setFillInterior(false)} className="btn-ghost" style={{ flex: 1, fontSize: 10, borderColor: !fillInterior ? 'rgba(140,255,112,.6)' : undefined, color: !fillInterior ? 'var(--mmx-green)' : undefined }}>
                Ambiente interno (paredes ao redor)
              </button>
            </div>
            <p style={{ margin: '8px 0 0', color: 'var(--mmx-muted)', fontSize: 9, lineHeight: 1.5 }}>
              {fillInterior
                ? 'A malha é um objeto sólido (peça, obstáculo) — o volume dela vira sólido; o resto vira fluido.'
                : 'A malha é o contorno de um ambiente (sala, duto escaneado) — só a casca fina vira sólido; o ar dentro fica fluido.'}
            </p>
          </div>
          <div className="voxel-total"><strong>{totalCells.toLocaleString('pt-BR')}</strong><span>células totais</span></div>
          <div className="voxel-note"><Info size={17} /><p><strong>Sobre o tamanho da grade</strong>Uma grade maior captura mais detalhes, mas aumenta o custo computacional.</p></div>
        </section>
      )}

      {geometry && (
        <button type="button" onClick={handleVoxelize} disabled={voxelizing} className="btn-primary voxel-submit">
          <Box size={18} /> {voxelizing ? 'Construindo volume voxel…' : 'Voxelizar geometria'} <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
