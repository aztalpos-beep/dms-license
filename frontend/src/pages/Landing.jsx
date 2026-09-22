import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBranches } from '../api';

export default function Landing() {
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getBranches()
      .then((list) => {
        const activeBranches = (Array.isArray(list) ? list : [])
          .filter((branch) => branch.is_active !== false)
          .sort((a, b) => Number(a.id) - Number(b.id));

        setBranches(activeBranches);
      })
      .catch(() => {
        setError('Could not load branches. Is the backend running?');
      });
  }, []);

  return (
    <div className="landing">
      <div className="landing-header">
        <div className="tag">DEMO ERP</div>
        <h1>Demo ERP</h1>
        <p>Select your branch to sign in.</p>
      </div>

      {error && (
        <div
          className="login-error"
          style={{
            maxWidth: 420,
            margin: '0 auto 20px',
          }}
        >
          {error}
        </div>
      )}

      <div className="branch-grid">
        {branches.map((branch, index) => (
          <div className="branch-card" key={branch.id}>
            <div className="index">
              BRANCH {String(index + 1).padStart(2, '0')}
            </div>

            <h2>{branch.name}</h2>

            {branch.location && (
              <div className="location">{branch.location}</div>
            )}

            <button
              type="button"
              className="btn primary"
              onClick={() => navigate(`/login/${branch.id}`)}
            >
              Sign In →
            </button>
          </div>
        ))}
      </div>

      <div className="landing-footer">
        Head office / consolidated access —{' '}
        <a
          href="/admin-login"
          onClick={(e) => {
            e.preventDefault();
            navigate('/admin-login');
          }}
        >
          Super Admin Login
        </a>
      </div>
    </div>
  );
}