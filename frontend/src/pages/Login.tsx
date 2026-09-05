import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Gauge, Layers3, Lock, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { AuthAPI, getErrorMessage } from '../services/api';
import FlowHero3D from '../components/FlowHero3D';
import LogoMark from '../components/LogoMark';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = mode === 'login'
        ? await AuthAPI.login(email, password)
        : await AuthAPI.register(email, password, fullName, company);
      localStorage.setItem('mmx_token', data.access_token);
      localStorage.setItem('mmx_refresh', data.refresh_token);
      navigate('/');
    } catch (err: any) {
      setError(getErrorMessage(err, 'Não foi possível autenticar. Verifique seus dados e tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-story">
        <LogoMark className="login-brand" />
        <div className="login-copy">
          <h1>Simulação de fluidos<br /><span>na velocidade da GPU.</span></h1>
          <p>Prepare geometrias, configure a física e acompanhe campos de escoamento em uma única bancada de engenharia.</p>
        </div>

        <div className="login-capabilities" aria-label="Capacidades da plataforma">
          <div><Gauge size={18} /><span><strong>GPU CUDA</strong>Processamento paralelo</span></div>
          <div><Layers3 size={18} /><span><strong>Multi-projeto</strong>Contextos isolados</span></div>
          <div><ShieldCheck size={18} /><span><strong>Dados íntegros</strong>Fluxo verificável</span></div>
        </div>

        <FlowHero3D />
        <div className="login-scene-meta">
          <span>LBM D3Q19</span><span>WebGL</span><span>Prévia interativa</span>
        </div>
      </section>

      <section className="login-access" aria-label="Acesso à plataforma">
        <div className="login-panel">
          <div className="login-tabs" role="tablist" aria-label="Escolha o tipo de acesso">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>
              <ArrowRight size={17} /> Entrar
            </button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>
              <UserPlus size={17} /> Criar conta
            </button>
          </div>

          <div className="login-form-heading">
            <h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Comece uma nova bancada'}</h2>
            <p>{mode === 'login' ? 'Entre na sua conta para continuar.' : 'Crie o acesso da sua equipe de engenharia.'}</p>
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">Nome completo
                  <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Seu nome" className="input-mmx" autoComplete="name" required />
                </label>
                <label className="field-label">Empresa
                  <input type="text" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Sua empresa" className="input-mmx" autoComplete="organization" />
                </label>
              </div>
            )}

            <label className="field-label">E-mail
              <span className="input-with-icon"><Mail size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" className="input-mmx" autoComplete="email" required /></span>
            </label>

            <label className="field-label">Senha
              <span className="input-with-icon"><Lock size={18} /><input type={showPwd ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" className="input-mmx" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
                <button type="button" onClick={() => setShowPwd((value) => !value)} aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}>{showPwd ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>

            <button type="submit" disabled={loading} className="btn-primary login-submit">
              {loading ? <span className="button-loader" aria-label="Autenticando" /> : <>{mode === 'login' ? 'Entrar na plataforma' : 'Criar conta'}<ArrowRight size={18} /></>}
            </button>
          </form>

          <p className="login-legal">Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade da plataforma.</p>
        </div>
        <div className="login-build"><span>MMX Mechanics</span><span>build v1.0.0</span></div>
      </section>
    </main>
  );
}
