import { useState, memo } from 'react';

function InsightsPanel({ insights = [], title = 'AI-Generated Executive Insights', max = 6 }) {
  const [openCats, setOpenCats] = useState({});
  const [openItems, setOpenItems] = useState({});

  const items = insights.slice(0, max);
  if (!items.length) return null;

  // Group by category
  const grouped = {};
  for (const ins of items) {
    const cat = ins.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(ins);
  }

  const toggleCat = (cat) => setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  const toggleItem = (key) => setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="insights-panel">
      <div className="insights-header">
        <div className="insights-header-icon">🤖</div>
        <div>
          <div className="insights-header-title">{title}</div>
          <div className="insights-header-sub">Click a category to expand · Click a topic to read details</div>
        </div>
      </div>

      <div className="insight-accordion">
        {Object.entries(grouped).map(([cat, catItems], ci) => {
          const isCatOpen = !!openCats[cat];
          const catColor = catItems[0]?.color || 'var(--accent-cyan)';

          return (
            <div key={ci} className="insight-cat-block">
              {/* Category header — toggles the group */}
              <button
                className="insight-cat-toggle"
                onClick={() => toggleCat(cat)}
                style={{ borderLeft: `3px solid ${catColor}` }}
              >
                <span className="insight-cat-icon">{catItems[0]?.icon || '💡'}</span>
                <span className="insight-cat-label" style={{ color: catColor }}>{cat}</span>
                <span className="insight-cat-count">{catItems.length} insight{catItems.length > 1 ? 's' : ''}</span>
                <span className="insight-cat-chevron" style={{ transform: isCatOpen ? 'rotate(90deg)' : 'none' }}>›</span>
              </button>

              {/* Subcategory items */}
              {isCatOpen && (
                <div className="insight-sublist">
                  {catItems.map((ins, ii) => {
                    const itemKey = `${ci}_${ii}`;
                    const isOpen = !!openItems[itemKey];
                    return (
                      <div key={ii} className="insight-sub-item">
                        <button
                          className="insight-sub-toggle"
                          onClick={() => toggleItem(itemKey)}
                        >
                          <span className="insight-sub-title">{ins.title}</span>
                          <span className="insight-sub-chevron" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                        </button>
                        {isOpen && ins.detail && (
                          <div className="insight-sub-detail">{ins.detail}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(InsightsPanel);
