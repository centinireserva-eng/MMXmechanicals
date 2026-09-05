import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, UploadCloud, FolderKanban, FlaskConical, Library, Settings, LogOut, Activity, ChevronRight } from 'lucide-react';
import LogoMark from '../LogoMark';
const navItems = [
  { key: 'dashboard', icon: LayoutDashboard, path: '/' },
  { key: 'upload', icon: UploadCloud, path: '/geometry/upload' },
  { key: 'library', icon: Library, path: '/library' },
  { key: 'projects', icon: FolderKanban, path: '/projects' },
  { key: 'simulations', icon: FlaskConical, path: '/simulations' },
  { key: 'settings', icon: Settings, path: '/settings' },
];
export default function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem('mmx_token');
    localStorage.removeItem('mmx_refresh');
    navigate('/login');
  };
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand"><LogoMark /></div>
      <nav className="sidebar-nav" aria-label="Navegação principal">
        {navItems.map(item => {
          const active = location.pathname === item.path;
          return (
            <NavLink key={item.key} to={item.path} className="sidebar-link" data-active={active || undefined}>
              <item.icon size={17} />
              <span>{t(`nav.${item.key}`)}</span>
              {active && <ChevronRight size={13} className="ml-auto" />}
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-engine">
        <div>
          <span className="status-dot" />
          <div><p>GPU Engine</p><small>CUDA · D3Q19</small></div>
          <Activity size={16} />
        </div>
      </div>
      <div className="sidebar-user">
        <div className="sidebar-avatar">FF</div>
        <div className="min-w-0 flex-1"><p>Francisco</p><small>Figsmor Engenharia</small></div>
        <button type="button" aria-label="Sair" onClick={handleLogout}><LogOut size={16} /></button>
      </div>
    </aside>
  );
}
