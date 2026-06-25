import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestOTP, ApiError } from '../api/auth';

interface Props {
  onEmailSent: (email: string, expiresAt: string) => void;
}

export default function LoginPage({ onEmailSent }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await requestOTP(email.trim());
      const expiresAt = res.expiresAt ?? new Date(Date.now() + (res.expiresInSeconds ?? 300) * 1000).toISOString();
      onEmailSent(email.trim().toLowerCase(), expiresAt);
      navigate('/otp');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const data = err.data as { retryAfterSeconds?: number };
          const wait = data.retryAfterSeconds ?? 60;
          const minutes = Math.ceil(wait / 60);
          setMessage({
            type: 'error',
            text: `Muitas tentativas. Aguarde ${minutes} minuto${minutes > 1 ? 's' : ''} antes de tentar novamente.`,
          });
        } else {
          setMessage({ type: 'error', text: err.message });
        }
      } else {
        setMessage({ type: 'error', text: 'Erro de conexão. Verifique sua internet e tente novamente.' });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__logo">
          <div className="card__logo-icon">🔐</div>
          <span className="card__logo-text">Portal Seguro</span>
        </div>

        <h1 className="card__title">Entrar</h1>
        <p className="card__subtitle">
          Informe seu e-mail para receber um código de acesso único.
        </p>

        {message && (
          <div className={`alert alert--${message.type === 'error' ? 'error' : 'info'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoFocus
              autoComplete="email"
              required
            />
          </div>

          <button type="submit" className="btn btn--primary" disabled={loading || !email.trim()}>
            {loading ? <><span className="spinner" /> Enviando...</> : 'Enviar código'}
          </button>
        </form>

        <p className="hint">
          Você receberá um código de 7 dígitos no seu e-mail,<br />
          se ele estiver cadastrado no sistema.
        </p>
      </div>
    </div>
  );
}
