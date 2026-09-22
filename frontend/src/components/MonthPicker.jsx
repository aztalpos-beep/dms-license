import React, { useState, useRef, useEffect } from 'react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// value/onChange use "YYYY-MM" strings, same as native <input type="month">
export default function MonthPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(Number(value.split('-')[0]));
  const wrapRef = useRef(null);

  const [selectedYear, selectedMonth] = value.split('-').map(Number);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectMonth(monthIndex) {
    const mm = String(monthIndex + 1).padStart(2, '0');
    onChange(`${viewYear}-${mm}`);
    setOpen(false);
  }

  return (
    <div className="month-picker" ref={wrapRef}>
      <button type="button" className="month-picker-trigger" onClick={() => { setViewYear(selectedYear); setOpen((o) => !o); }}>
        <span className="num">{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="month-picker-panel">
          <div className="month-picker-year-row">
            <button type="button" onClick={() => setViewYear((y) => y - 1)}>‹</button>
            <span className="num">{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)}>›</button>
          </div>
          <div className="month-picker-grid">
            {MONTH_NAMES.map((m, idx) => {
              const isSelected = viewYear === selectedYear && idx + 1 === selectedMonth;
              return (
                <button
                  type="button"
                  key={m}
                  className={`month-picker-cell${isSelected ? ' selected' : ''}`}
                  onClick={() => selectMonth(idx)}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
