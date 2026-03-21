import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ConnectionStatus } from '../hooks/useConnectionStatus';

interface Props {
  status: ConnectionStatus;
  isLan: boolean;
  serverName: string;
}

export default function ConnectionIndicator({ status, isLan, serverName }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const label = isLan ? 'LAN' : t('connection.extern');
  const tooltip =
    status === 'connected'
      ? t('connection.connectedTo', { server: serverName })
      : status === 'disconnected'
      ? t('connection.disconnectedFrom', { server: serverName })
      : t('connection.checking');

  return (
    <div
      className="connection-indicator"
      style={{ cursor: 'pointer' }}
      onClick={() => navigate('/settings', { state: { tab: 'server' } })}
      data-tooltip={tooltip}
      data-tooltip-pos="bottom"
    >
      <div className={`connection-led connection-led--${status}`} />
      <div className="connection-meta">
        <span className="connection-type">{label}</span>
        <span className="connection-server">{serverName}</span>
      </div>
    </div>
  );
}
