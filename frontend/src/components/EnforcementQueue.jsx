import React, { useState, useEffect } from 'react';
import { getAqiCurrent, getAqiForecast, getVulnerableSites } from '../api';

function getActionStyles(action) {
  switch (action) {
    case 'Priority inspection recommended':
      return { color: '#d9534f', bg: '#fdf2f2', border: '#f8d7da' };
    case 'Increased monitoring recommended':
      return { color: '#fa8c16', bg: '#fffbe6', border: '#ffe58f' };
    case 'Monitor closely':
      return { color: '#1890ff', bg: '#e6f7ff', border: '#91d5ff' };
    default:
      return { color: '#52c41a', bg: '#f6ffed', border: '#b7eb8f' };
  }
}

export default function EnforcementQueue({ city, selectedCity }) {
  const activeCity = city || selectedCity;
  const [rankedList, setRankedList] = useState([]);
  const [excludedList, setExcludedList] = useState([]);
  const [loading, setLoading] = useState(true);

  const calculateQueue = (isMounted) => {
    setLoading(true);
    const citiesList = ['Chennai', 'Delhi', 'Bengaluru'];

    // For all 3 cities in parallel: call getAqiCurrent, getAqiForecast(..., 24), getVulnerableSites
    const promises = citiesList.flatMap(c => [
      getAqiCurrent(c),
      getAqiForecast(c, 24),
      getVulnerableSites(c)
    ]);

    Promise.allSettled(promises)
      .then((results) => {
        if (!isMounted) return;

        const resultsMap = {};
        citiesList.forEach((c, idx) => {
          const resCurrent = results[idx * 3];
          const resForecast = results[idx * 3 + 1];
          const resSites = results[idx * 3 + 2];

          if (
            resCurrent.status === 'fulfilled' &&
            resForecast.status === 'fulfilled' &&
            resSites.status === 'fulfilled'
          ) {
            resultsMap[c] = {
              current: resCurrent.value,
              forecast: resForecast.value,
              sites: resSites.value,
              error: null
            };
          } else {
            const missing = [];
            if (resCurrent.status === 'rejected') missing.push('current AQI');
            if (resForecast.status === 'rejected') missing.push('24h forecast');
            if (resSites.status === 'rejected') missing.push('vulnerable sites');
            resultsMap[c] = {
              current: null,
              forecast: null,
              sites: null,
              error: `Missing info: ${missing.join(', ')}`
            };
          }
        });

        const ranks = [];
        const excluded = [];

        citiesList.forEach(c => {
          const info = resultsMap[c];
          if (info.error) {
            excluded.push({ name: c, reason: info.error });
            return;
          }

          const currentAqi = info.current && info.current.aqi_value !== undefined ? info.current.aqi_value : null;
          const forecastAqi = info.forecast && info.forecast.predicted_aqi !== undefined ? info.forecast.predicted_aqi : null;
          const siteCount = Array.isArray(info.sites) ? info.sites.length : 0;

          if (currentAqi === null || forecastAqi === null) {
            excluded.push({ name: c, reason: 'Incomplete AQI / Forecast data metrics' });
            return;
          }

          // FORMULA SPEC:
          // priority_score = current_aqi_value + max(0, forecast_24h_value - current_aqi_value) * 2 + min(vulnerable_site_count / 100, 20)
          const trendDiff = forecastAqi - currentAqi;
          const trendContribution = Math.max(0, trendDiff) * 2;
          const siteContribution = Math.min(siteCount / 100, 20);
          const score = currentAqi + trendContribution + siteContribution;

          // Determine direction
          let trend = 'flat';
          let trendLabel = '→ Flat';
          if (trendDiff > 0.5) {
            trend = 'worsening';
            trendLabel = '↗ Worsening';
          } else if (trendDiff < -0.5) {
            trend = 'improving';
            trendLabel = '↘ Improving';
          }

          // RECOMMENDED ACTION RULES:
          // 1. if AQI > 200 and trend is worsening -> "Priority inspection recommended"
          // 2. if AQI > 150 -> "Increased monitoring recommended"
          // 3. if trend is worsening but AQI <= 150 -> "Monitor closely"
          // 4. otherwise -> "Routine monitoring sufficient"
          let actionLabel = 'Routine monitoring sufficient';
          if (currentAqi > 200 && trend === 'worsening') {
            actionLabel = 'Priority inspection recommended';
          } else if (currentAqi > 150) {
            actionLabel = 'Increased monitoring recommended';
          } else if (trend === 'worsening') {
            actionLabel = 'Monitor closely';
          }

          ranks.push({
            name: c,
            score: Math.round(score * 100) / 100,
            currentAqi,
            forecast24: forecastAqi,
            siteCount,
            trendLabel,
            actionLabel,
            trend
          });
        });

        // Sort descending by score
        ranks.sort((a, b) => b.score - a.score);

        setRankedList(ranks);
        setExcludedList(excluded);
        setLoading(false);
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    let isMounted = true;
    calculateQueue(isMounted);
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    calculateQueue(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '220px', border: '1px solid #ddd', borderRadius: '8px', background: '#fcfcfc', padding: '1rem', boxSizing: 'border-box' }}>
        <div>Evaluating enforcement priorities...</div>
      </div>
    );
  }

  return (
    <div className="enforcement-queue-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', background: '#fff', boxSizing: 'border-box', minHeight: '220px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h3 style={{ margin: 0 }}>Enforcement & Inspection Priority Queue</h3>
        <button
          onClick={handleRefresh}
          style={{
            padding: '4px 10px',
            fontSize: '0.85rem',
            cursor: 'pointer',
            background: '#ff4d4f',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          🔄 Recalculate
        </button>
      </div>

      {rankedList.length === 0 && excludedList.length === 0 ? (
        <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center' }}>No priority ranking data could be resolved.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rankedList.map((item, index) => {
            const isSelected = activeCity === item.name;
            const actionStyles = getActionStyles(item.actionLabel);
            const trendStyle = item.trend === 'worsening'
              ? { color: '#ff4d4f', fontWeight: 'bold' }
              : item.trend === 'improving'
              ? { color: '#52c41a', fontWeight: 'bold' }
              : { color: '#7f8c8d' };

            return (
              <div
                key={item.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  border: isSelected ? '2px solid #007bff' : '1px solid #e8e8e8',
                  borderRadius: '6px',
                  background: isSelected ? '#f0f7ff' : '#fff',
                  boxShadow: isSelected ? '0 4px 10px rgba(0, 123, 255, 0.1)' : 'none',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {/* Visual Rank Badge */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: index === 0 ? '#ff4d4f' : index === 1 ? '#fa8c16' : '#52c41a',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  marginRight: '16px',
                  flexShrink: 0
                }}>
                  {index + 1}
                </div>

                {/* City Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#2c3e50' }}>{item.name}</h4>
                    <span style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>
                      (Score: <strong style={{ color: '#2c3e50' }}>{item.score}</strong>)
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '15px', marginTop: '6px', fontSize: '0.85rem', color: '#666', flexWrap: 'wrap' }}>
                    <span>Current AQI: <strong style={{ color: '#333' }}>{item.currentAqi}</strong></span>
                    <span>Trend: <span style={trendStyle}>{item.trendLabel}</span></span>
                    <span>Vulnerable Sites: <strong style={{ color: '#333' }}>{item.siteCount}</strong></span>
                  </div>
                </div>

                {/* Actions Label Badge */}
                <div style={{
                  alignSelf: 'center',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  color: actionStyles.color,
                  background: actionStyles.bg,
                  border: `1px solid ${actionStyles.border}`,
                  textAlign: 'center',
                  flexShrink: 0,
                  maxWidth: '180px'
                }}>
                  {item.actionLabel}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Render failures panel */}
      {excludedList.length > 0 && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: '6px', fontSize: '0.8rem', color: '#888' }}>
          <strong style={{ color: '#cf1322' }}>⚠️ Excluded from priority queue:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {excludedList.map(item => (
              <li key={item.name}>
                <strong>{item.name}</strong>: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
