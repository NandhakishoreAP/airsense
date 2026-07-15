import React, { useState, useEffect } from 'react';
import { getAqiCurrent, getAqiForecast, getVulnerableSites } from '../api';

function getActionBadgeClass(action) {
  switch (action) {
    case 'Priority inspection recommended':
      return 'badge-urgency-priority';
    case 'Increased monitoring recommended':
      return 'badge-urgency-increased';
    case 'Monitor closely':
      return 'badge-urgency-monitor';
    default:
      return 'badge-urgency-routine';
  }
}

function getAqiClassName(aqi) {
  if (aqi === null || aqi === undefined) return 'aqi-unknown';
  if (aqi <= 50) return 'aqi-good';
  if (aqi <= 100) return 'aqi-moderate';
  if (aqi <= 150) return 'aqi-unhealthy-sensitive';
  if (aqi <= 200) return 'aqi-unhealthy';
  if (aqi <= 300) return 'aqi-very-unhealthy';
  return 'aqi-hazardous';
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
      <div className="panel-loading">
        <div>Evaluating enforcement priorities...</div>
      </div>
    );
  }

  return (
    <div className="enforcement-queue-container panel-container">
      <div className="panel-footer-meta" style={{ marginBottom: 'var(--space-3)' }}>
        <div className="card-title-container">
          <svg className="card-icon icon-enforcement" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <h3 className="card-title">Enforcement & Inspection Priority Queue</h3>
        </div>
        <button
          onClick={handleRefresh}
          className="btn"
        >
          🔄 Recalculate
        </button>
      </div>

      {rankedList.length === 0 && excludedList.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center' }}>No priority ranking data could be resolved.</p>
      ) : (
        <div className="enforcement-list">
          {rankedList.map((item, index) => {
            const isSelected = activeCity === item.name;
            const actionBadgeClass = getActionBadgeClass(item.actionLabel);
            const trendStyle = item.trend === 'worsening'
              ? { color: 'var(--urgency-priority-text)', fontWeight: 'bold' }
              : item.trend === 'improving'
              ? { color: 'var(--confidence-high-text)', fontWeight: 'bold' }
              : { color: 'var(--text-secondary)' };

            return (
              <div
                key={item.name}
                className={`enforcement-row fade-in ${isSelected ? 'selected' : ''}`}
                style={{
                  animationDelay: `${index * 60}ms` // dynamic offset stagger cascades on mount
                }}
              >
                {/* Visual Rank Badge */}
                <div className={`rank-marker rank-${index + 1}`}>
                  {index + 1}
                </div>

                {/* City Details */}
                <div className="enforcement-details">
                  <div className="enforcement-details-header">
                    <h4>{item.name}</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      (Score: <strong style={{ color: 'var(--text-primary)' }}>{item.score}</strong>)
                    </span>
                  </div>

                  <div className="enforcement-details-sub">
                    <span>
                      Current AQI: <span className={`aqi-badge ${getAqiClassName(item.currentAqi)}`} style={{ padding: '2px 6px', fontSize: '0.8rem', marginLeft: '4px' }}>{item.currentAqi}</span>
                    </span>
                    <span>Trend: <span style={trendStyle}>{item.trendLabel}</span></span>
                    <span>Vulnerable Sites: <strong style={{ color: 'var(--text-primary)' }}>{item.siteCount}</strong></span>
                  </div>
                </div>

                {/* Actions Label Badge */}
                <div className={`badge ${actionBadgeClass}`}>
                  {item.actionLabel}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Render failures panel */}
      {excludedList.length > 0 && (
        <div className="error-banner" style={{ background: 'var(--urgency-priority)', border: '1px solid rgba(126, 0, 35, 0.2)', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--urgency-priority-text)' }}>⚠️ Excluded from priority queue:</strong>
          <ul>
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
