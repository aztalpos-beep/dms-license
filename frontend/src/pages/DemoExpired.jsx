import React, { useEffect } from 'react';

export default function DemoExpired() {
  useEffect(() => {
    document.title = 'Demo Trial Expired | Demo ERP';
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap');

        .demo-expired-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          background:
            radial-gradient(circle at top, #ffffff 0%, #f5f8fc 45%, #eaf0f7 100%);
          font-family: Arial, Helvetica, sans-serif;
          box-sizing: border-box;
        }

        .demo-expired-card {
          width: 100%;
          max-width: 720px;
          background: rgba(255, 255, 255, 0.97);
          border: 1px solid #dce4ee;
          border-radius: 24px;
          padding: 46px 48px 42px;
          text-align: center;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.10);
          box-sizing: border-box;
        }

        .demo-expired-icon {
          width: 88px;
          height: 88px;
          margin: 0 auto 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff5e9;
          font-size: 42px;
        }

        .demo-expired-brand {
          margin-bottom: 20px;
          color: #64748b;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .demo-expired-title {
          margin: 0;
          color: #0f172a;
          font-size: 38px;
          line-height: 1.2;
          font-weight: 800;
        }

        .demo-expired-urdu-title {
          margin: 10px 0 24px;
          color: #0f172a;
          font-family: 'Noto Nastaliq Urdu', serif;
          font-size: 30px;
          line-height: 2;
          font-weight: 700;
          direction: rtl;
        }

        .demo-expired-english {
          max-width: 570px;
          margin: 0 auto;
          color: #64748b;
          font-size: 16px;
          line-height: 1.8;
        }

        .demo-expired-urdu {
          max-width: 600px;
          margin: 12px auto 0;
          color: #334155;
          font-family: 'Noto Nastaliq Urdu', serif;
          font-size: 19px;
          line-height: 2.4;
          direction: rtl;
        }

        .demo-expired-info {
          margin-top: 28px;
          padding: 20px 24px;
          background: #f3f8fd;
          border: 1px solid #e2edf7;
          border-radius: 16px;
        }

        .demo-expired-info-en {
          color: #1e293b;
          font-size: 15px;
          line-height: 1.7;
          font-weight: 700;
        }

        .demo-expired-info-ur {
          margin-top: 5px;
          color: #334155;
          font-family: 'Noto Nastaliq Urdu', serif;
          font-size: 17px;
          line-height: 2.2;
          direction: rtl;
        }

        .demo-expired-button {
          margin-top: 30px;
          min-width: 250px;
          border: 0;
          border-radius: 12px;
          padding: 13px 28px 11px;
          background: #0f172a;
          color: #ffffff;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
          transition: transform 0.15s ease, background 0.15s ease;
        }

        .demo-expired-button:hover {
          background: #1e293b;
          transform: translateY(-1px);
        }

        .demo-expired-button-en {
          display: block;
          font-size: 15px;
          font-weight: 800;
        }

        .demo-expired-button-ur {
          display: block;
          margin-top: 2px;
          font-family: 'Noto Nastaliq Urdu', serif;
          font-size: 14px;
          line-height: 1.8;
          direction: rtl;
        }

        @media (max-width: 640px) {
          .demo-expired-page {
            padding: 18px 12px;
          }

          .demo-expired-card {
            padding: 34px 20px 30px;
            border-radius: 18px;
          }

          .demo-expired-icon {
            width: 72px;
            height: 72px;
            font-size: 34px;
          }

          .demo-expired-title {
            font-size: 29px;
          }

          .demo-expired-urdu-title {
            font-size: 24px;
          }

          .demo-expired-english {
            font-size: 15px;
          }

          .demo-expired-urdu {
            font-size: 17px;
          }

          .demo-expired-info {
            padding: 17px 15px;
          }

          .demo-expired-button {
            width: 100%;
            min-width: 0;
          }
        }
      `}</style>

      <div className="demo-expired-page">
        <div className="demo-expired-card">
          <div className="demo-expired-icon" aria-hidden="true">
            ⏱️
          </div>

          <div className="demo-expired-brand">DEMO ERP</div>

          <h1 className="demo-expired-title">
            Demo Trial Expired
          </h1>

          <div className="demo-expired-urdu-title" lang="ur">
            ڈیمو ٹرائل کی مدت ختم ہو چکی ہے
          </div>

          <p className="demo-expired-english">
            Your 3-day Demo ERP trial has ended. Please contact us to
            activate your account and continue using the system.
          </p>

          <p className="demo-expired-urdu" lang="ur">
            آپ کے 3 دن کے ڈیمو ERP ٹرائل کی مدت ختم ہو چکی ہے۔
            براہِ کرم اپنا اکاؤنٹ فعال کروانے اور سسٹم کا استعمال جاری
            رکھنے کے لیے ہم سے رابطہ کریں۔
          </p>

          <div className="demo-expired-info">
            <div className="demo-expired-info-en">
              Your demo data remains safe and can be continued after activation.
            </div>

            <div className="demo-expired-info-ur" lang="ur">
              آپ کا ڈیمو ڈیٹا محفوظ ہے اور اکاؤنٹ فعال ہونے کے بعد
              آپ وہیں سے کام جاری رکھ سکتے ہیں۔
            </div>
          </div>

          <button
            type="button"
            className="demo-expired-button"
            onClick={() => window.location.replace('/')}
          >
            <span className="demo-expired-button-en">
              Back to Demo ERP
            </span>

            <span className="demo-expired-button-ur" lang="ur">
              ڈیمو ERP پر واپس جائیں
            </span>
          </button>
        </div>
      </div>
    </>
  );
}