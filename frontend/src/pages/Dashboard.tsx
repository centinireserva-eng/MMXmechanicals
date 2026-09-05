import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, FlaskConical, Plus, Upload, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { SimulationAPI } from '../services/api';
export default function Dashboard() {
  const { t } = useTranslation(); const navigate = useNavigate();
  const [sims, setSims] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { SimulationAPI.list().then(res => setSims(res.data)).catch(() => setSims([])).finally(() => setLoading(false)); }, []);
  const stats = [
    { label: t('dashboard.activeSimulations'), value: sims.filter(s => s.status === 'running').length, icon: Activity },
    { label: t('dashboard.totalRuns'), value: sims.length, icon: FlaskConical },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="font-display text-2xl font-bold">{t('dashboard.welcome')}, Francisco</h1><p className="text-mmx-muted text-sm mt-1">{t('dashboard.subtitle')}</p></div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/geometry/upload')} className="btn-ghost flex items-center gap-2 text-sm"><Upload size={16} /> {t('dashboard.importGeometry')}</button>
          <button onClick={() => navigate('/simulation/new')} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> {t('dashboard.newSimulation')}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((s, i) => <div key={i} className="card"><s.icon size={20} className="text-mmx-accent mb-3" /><p className="text-2xl font-bold font-mono">{s.value}</p><p className="text-xs text-mmx-muted mt-1">{s.label}</p></div>)}
      </div>
      <div className="card lg:col-span-2">
        <h2 className="section-title mb-4">{t('dashboard.recentSimulations')}</h2>
        {loading ? <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-2 border-mmx-border border-t-mmx-accent animate-spin" /></div> :
         sims.length === 0 ? <div className="text-center py-12"><FlaskConical size={40} className="text-mmx-dim mx-auto mb-3" /><p className="text-mmx-muted">{t('dashboard.noSimulations')}</p></div> :
         <div className="space-y-2">{sims.map(sim => <div key={sim.id} onClick={() => navigate(`/simulation/${sim.id}`)} className="flex items-center gap-4 p-3 rounded-xl hover:bg-mmx-elevated cursor-pointer">
           <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-mmx-accent/15">{sim.status === 'completed' ? <CheckCircle2 size={18} className="text-mmx-accent" /> : sim.status === 'running' ? <Loader2 size={18} className="text-mmx-accent-2 animate-spin" /> : sim.status === 'failed' ? <XCircle size={18} className="text-mmx-danger" /> : <Clock size={18} className="text-mmx-warn" />}</div>
           <div className="flex-1"><p className="text-sm font-semibold">{sim.name}</p><p className="text-xs text-mmx-muted">{sim.grid_size}</p></div>
           <span className={`badge badge-${sim.status === 'completed' ? 'success' : sim.status === 'running' ? 'running' : sim.status === 'failed' ? 'failed' : 'pending'}`}>{t(`simulation.${sim.status}`)}</span>
         </div>)}</div>}
      </div>
    </div>
  );
}