import { useState, memo } from 'react';

// items: [{ q: string, a: string }]
function FAQSection({ items = [], title = 'FAQ — About This Page' }) {
  const [open, setOpen] = useState({});
  if (!items.length) return null;

  const toggle = (i) => setOpen(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="faq-section">
      <div className="faq-header">
        <div className="faq-header-icon">❓</div>
        <div>
          <div className="faq-header-title">{title}</div>
          <div className="faq-header-sub">Click a question to expand</div>
        </div>
      </div>

      <div className="faq-list">
        {items.map((item, i) => {
          const isOpen = !!open[i];
          return (
            <div key={i} className="faq-item">
              <button className="faq-question" onClick={() => toggle(i)}>
                <span className="faq-question-text">{item.q}</span>
                <span className="faq-chevron" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>›</span>
              </button>
              {isOpen && <div className="faq-answer">{item.a}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(FAQSection);
