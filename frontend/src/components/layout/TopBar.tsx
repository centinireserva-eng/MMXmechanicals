import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Globe } from 'lucide-react';
import LogoMark from '../LogoMark';
export default function TopBar() {
  const { i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.language);
  return (
    <header className="app-topbar">
      <div className="lg:hidden"><LogoMark /></div>
      <div className="topbar-context"><span className="status-dot" /><span>Workspace operacional</span><small>GPU disponível</small></div>
      <div className="topbar-actions">
          <button type="button" onClick={() => { const n = lang === 'pt-BR' ? 'en' : 'pt-BR'; i18n.changeLanguage(n); setLang(n); }} aria-label="Alterar idioma"><Globe size={17} /><span className="hidden sm:inline">{lang === 'pt-BR' ? 'PT' : 'EN'}</span></button>
          <button type="button" aria-label="Notificações"><Bell size={17} /><span className="notification-dot" /></button>
        </div>
    </header>
  );
}
