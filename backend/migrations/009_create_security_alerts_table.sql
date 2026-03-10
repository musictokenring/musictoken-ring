-- Migration: Create security_alerts table for security incident logging
-- This table logs security events (wallet mismatches, suspicious activity, etc.)

CREATE TABLE IF NOT EXISTS security_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(100) NOT NULL, -- Type of alert (e.g., 'WALLET_MISMATCH', 'RATE_LIMIT_EXCEEDED')
    severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    details JSONB, -- JSON object with alert details
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255), -- Admin who resolved it
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON security_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved ON security_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_user_id ON security_alerts(user_id);

-- Index for finding unresolved critical alerts
CREATE INDEX IF NOT EXISTS idx_security_alerts_critical_unresolved ON security_alerts(severity, resolved) WHERE severity IN ('high', 'critical') AND resolved = FALSE;

COMMENT ON TABLE security_alerts IS 'Security alerts and incidents log for monitoring and response';
COMMENT ON COLUMN security_alerts.alert_type IS 'Type of security alert (e.g., WALLET_MISMATCH)';
COMMENT ON COLUMN security_alerts.details IS 'JSON object containing alert-specific details';
COMMENT ON COLUMN security_alerts.severity IS 'Severity level: low, medium, high, critical';
