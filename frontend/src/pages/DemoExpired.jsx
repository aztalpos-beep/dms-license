import React, { useEffect } from 'react';

export default function DemoExpired() {
  useEffect(() => {
    document.title = 'Demo Trial Expired | Demo ERP';
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background:
          'linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: '#ffffff',
          borderRadius: '20px',
          padding: '48px 36px',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.12)',
          border: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: '#fff7ed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '34px',
          }}
        >
          ⏱
        </div>

        <div
          style={{
            fontSize: '13px',
            fontWeight: '800',
            letterSpacing: '1.5px',
            color: '#64748b',
            marginBottom: '12px',
          }}
        >
          DEMO ERP
        </div>

        <h1
          style={{
            margin: '0 0 16px',
            fontSize: '32px',
            color: '#0f172a',
          }}
        >
          Demo Trial Expired
        </h1>

        <p
          style={{
            margin: '0 auto',
            maxWidth: '430px',
            fontSize: '16px',
            lineHeight: '1.7',
            color: '#64748b',
          }}
        >
          Your 3-day Demo ERP trial has ended. Please contact us to
          activate your account and continue using the system.
        </p>

        <div
          style={{
            marginTop: '30px',
            padding: '16px',
            borderRadius: '12px',
            background: '#f8fafc',
            color: '#475569',
            fontSize: '14px',
          }}
        >
          Your demo data remains محفوظ and can be continued after activation.
        </div>

        <button
          type="button"
          onClick={() => window.location.replace('/')}
          style={{
            marginTop: '28px',
            border: 0,
            borderRadius: '10px',
            padding: '13px 24px',
            fontSize: '15px',
            fontWeight: '700',
            cursor: 'pointer',
            background: '#0f172a',
            color: '#ffffff',
          }}
        >
          Back to Demo ERP
        </button>
      </div>
    </div>
  );
}