import { useState, FormEvent, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyOTP, requestOTP, ApiError } from '../api/auth';
import Timer, { useCountdown, formatSeconds } from '../components/Timer';
import { config } from '../config';

interface Props {
  email: string;
  onAuthenticated: () => void;
  onBack: () => void;
}

export default function OTPPage({ email, onAuthenticated, onBack }: Props) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [expired, setExpired] = useState(false);
  const [alert, setAlert] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  // expiresAt: quando o OTP expira
  const [expiresAt, setExpiresAt] = useState<Date>(() => {
    const stored = sessionStorage.getItem('otp_expires_at');
    if (stored) return new Date(stored);
    return new Date(Date.now() + config.otpDurationSeconds * 1000);
  });

  // resendAvailableAt: quando o botão de reenvio é liberado
  const [resendAvailableAt, setResendAvailableAt] = useState<Date>(() => {
    const stored = sessionStorage.getItem('otp_requested_at');
    if (stored) {
      return new Date(new Date(stored).getTime() + config.cooldownSeconds * 1000);
    }
    return new Date(Date.now() + config.cooldownSeconds * 1000);
  });

  const resendSecondsLeft = useCountdown(resendAvailableAt);
  const canResend = resendSecondsLeft === 0 && !expired;

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleExpire = useCallback(() => {
    setExpired(true);
    setAlert({ type: 'error', text: 'Código expirado. Solicite um novo código.' });
  }, []);

  function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 7);
    setCode(digits);
    if (alert?.type === 'error') setAlert(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 7 || loading || expired) return;

    setLoading(true);
    setAlert(null);

    try {
      await verifyOTP(email, code);
      setAlert({ type: 'success', text: 'Autenticado com sucesso! Redirecionando...' });
      setTimeout(() => {
        sessionStorage.removeItem('otp_expires_at');
        sessionStorage.removeItem('otp_requested_at');
        onAuthenticated();
        navigate('/welcome', { replace: true });
      }, 600);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const data = err.data as { retryAfterSeconds?: number };
          const wait = data.retryAfterSeconds ?? 60;
          const minutes = Math.ceil(wait / 60);
          setAlert({
            type: 'error',
            text: `Muitas tentativas. Aguarde ${minutes} minuto${minutes > 1 ? 's' : ''}.`,
          });
        } else {
          setAlert({ type: 'error', text: err.message });
        }
      } else {
        setAlert({ type: 'error', text: 'Erro de conexão. Tente novamente.' });
      }
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!canResend || resending) return;
    setResending(true);
    setAlert(null);
    setCode('');
    setExpired(false);

    try {
      const res = await requestOTP(email);
      const now = new Date();
      const newExpiresAt = res.expiresAt
        ? new Date(res.expiresAt)
        : new Date(Date.now() + config.otpDurationSeconds * 1000);

      sessionStorage.setItem('otp_expires_at', newExpiresAt.toISOString());
      sessionStorage.setItem('otp_requested_at', now.toISOString());

      setExpiresAt(newExpiresAt);

      const newCooldown = res.cooldownSeconds ?? config.cooldownSeconds;
      setResendAvailableAt(new Date(Date.now() + newCooldown * 1000));

      setAlert({ type: 'success', text: 'Novo código enviado para o seu e-mail.' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const data = err.data as { retryAfterSeconds?: number };
        const wait = data.retryAfterSeconds ?? 180;
        const minutes = Math.ceil(wait / 60);
        setAlert({
          type: 'error',
          text: `Aguarde ${minutes} minuto${minutes > 1 ? 's' : ''} antes de solicitar um novo código.`,
        });
      } else {
        setAlert({ type: 'error', text: 'Falha ao reenviar. Tente novamente.' });
      }
    } finally {
      setResending(false);
      inputRef.current?.focus();
    }
  }

  function handleBack() {
    sessionStorage.removeItem('otp_expires_at');
    sessionStorage.removeItem('otp_requested_at');
    onBack();
    navigate('/', { replace: true });
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card__logo">
          <div className="card__logo-icon">🔐</div>
          <span className="card__logo-text">Portal Seguro</span>
        </div>

        <h1 className="card__title">Verificar código</h1>
        <p className="card__subtitle">
          Enviamos um código de 7 dígitos para{' '}
          <span className="email-highlight">{email}</span>.
        </p>

        {alert && (
          <div className={`alert alert--${alert.type}`}>
            {alert.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="otp-code">Código OTP</label>
            <input
              id="otp-code"
              ref={inputRef}
              className="otp-input"
              type="text"
              inputMode="numeric"
              pattern="\d{7}"
              maxLength={7}
              placeholder="0000000"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              disabled={loading || expired}
              autoComplete="one-time-code"
            />
          </div>

          {!expired && (
            <Timer
              targetDate={expiresAt}
              onExpire={handleExpire}
              urgentThreshold={60}
            />
          )}

          <button
            type="submit"
            className="btn btn--primary"
            disabled={code.length !== 7 || loading || expired}
          >
            {loading ? <><span className="spinner" /> Verificando...</> : 'Confirmar código'}
          </button>
        </form>

        <hr className="divider" />

        <button
          type="button"
          className="btn btn--ghost"
          onClick={handleResend}
          disabled={!canResend || resending}
        >
          {resending ? (
            <><span className="spinner spinner--dark" /> Reenviando...</>
          ) : !canResend ? (
            <>Reenviar em {formatSeconds(resendSecondsLeft)}</>
          ) : (
            <>Reenviar código</>
          )}
        </button>

        <button
          type="button"
          className="btn btn--ghost"
          onClick={handleBack}
          disabled={loading}
          style={{ marginTop: 8 }}
        >
          ← Usar outro e-mail
        </button>

        <p className="hint">
          Não recebeu? Verifique a pasta de spam ou aguarde alguns minutos.
        </p>
      </div>
    </div>
  );
}
