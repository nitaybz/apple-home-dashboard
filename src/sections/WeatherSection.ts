import { CustomizationManager } from '../utils/CustomizationManager';
import { localize } from '../utils/LocalizationService';

// Basmilius Meteocons animated SVG icon URLs (fill style)
const METEOCONS_BASE = 'https://basmilius.github.io/weather-icons/production/fill/all';

// Map HA conditions to Meteocons filenames and gradient themes
const CONDITION_MAP: Record<string, { icon: string; iconNight?: string; gradient: [string, string] }> = {
  'sunny':           { icon: 'clear-day',              iconNight: 'clear-night',              gradient: ['#1565C0', '#42A5F5'] },
  'clear-night':     { icon: 'clear-night',                                                    gradient: ['#0D1B2A', '#1B3A5C'] },
  'cloudy':          { icon: 'overcast',                                                       gradient: ['#546E7A', '#78909C'] },
  'partlycloudy':    { icon: 'partly-cloudy-day',      iconNight: 'partly-cloudy-night',      gradient: ['#37474F', '#607D8B'] },
  'rainy':           { icon: 'rain',                                                           gradient: ['#263238', '#455A64'] },
  'pouring':         { icon: 'extreme-rain',                                                   gradient: ['#1A237E', '#37474F'] },
  'snowy':           { icon: 'snow',                                                           gradient: ['#546E7A', '#90A4AE'] },
  'snowy-rainy':     { icon: 'sleet',                                                          gradient: ['#455A64', '#78909C'] },
  'fog':             { icon: 'fog',                                                            gradient: ['#616161', '#9E9E9E'] },
  'hail':            { icon: 'hail',                                                           gradient: ['#37474F', '#78909C'] },
  'lightning':       { icon: 'thunderstorms',                                                  gradient: ['#1A1A2E', '#3D3D6B'] },
  'lightning-rainy': { icon: 'thunderstorms-rain',                                             gradient: ['#1A1A2E', '#37474F'] },
  'windy':           { icon: 'wind',                                                           gradient: ['#455A64', '#78909C'] },
  'windy-variant':   { icon: 'wind',                                                           gradient: ['#455A64', '#78909C'] },
  'exceptional':     { icon: 'extreme',                                                        gradient: ['#4A148C', '#7B1FA2'] },
};

// MDI fallback icons (when Meteocons can't load)
const MDI_ICONS: Record<string, string> = {
  'sunny': 'mdi:weather-sunny', 'clear-night': 'mdi:weather-night',
  'cloudy': 'mdi:weather-cloudy', 'partlycloudy': 'mdi:weather-partly-cloudy',
  'rainy': 'mdi:weather-rainy', 'pouring': 'mdi:weather-pouring',
  'snowy': 'mdi:weather-snowy', 'snowy-rainy': 'mdi:weather-snowy-rainy',
  'fog': 'mdi:weather-fog', 'hail': 'mdi:weather-hail',
  'lightning': 'mdi:weather-lightning', 'lightning-rainy': 'mdi:weather-lightning-rainy',
  'windy': 'mdi:weather-windy', 'windy-variant': 'mdi:weather-windy-variant',
  'exceptional': 'mdi:alert-circle-outline',
};

interface ForecastDay {
  datetime: string;
  temperature?: number;
  templow?: number;
  condition?: string;
}

// Temperature-to-color mapping for forecast bars (Apple Weather style)
function tempToColor(temp: number): string {
  if (temp <= 0)  return '#4FC3F7'; // freezing - light blue
  if (temp <= 10) return '#29B6F6'; // cold - blue
  if (temp <= 15) return '#26C6DA'; // cool - teal
  if (temp <= 20) return '#66BB6A'; // mild - green
  if (temp <= 25) return '#FFEE58'; // warm - yellow
  if (temp <= 30) return '#FFA726'; // hot - orange
  if (temp <= 35) return '#EF5350'; // very hot - red
  return '#D32F2F';                 // extreme - dark red
}

function isNightTime(hass: any): boolean {
  const sun = hass.states?.['sun.sun'];
  return sun?.state === 'below_horizon';
}

export class WeatherSection {
  private customizationManager: CustomizationManager;
  private forecastCache: { entityId: string; data: ForecastDay[]; timestamp: number } | null = null;
  private static readonly CACHE_TTL = 10 * 60 * 1000;
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  constructor(customizationManager: CustomizationManager) {
    this.customizationManager = customizationManager;
  }

  async render(container: HTMLElement, hass: any): Promise<void> {
    const weatherEntity = await this.customizationManager.getWeatherEntity();
    if (!weatherEntity) return;

    const stateObj = hass.states[weatherEntity];
    if (!stateObj || stateObj.state === 'unavailable' || stateObj.state === 'unknown') return;

    this.injectStyles(container);

    // Clear any previous clock interval
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }

    const forecast = await this.fetchForecast(hass, weatherEntity, stateObj);
    const todayForecast = forecast.length > 0 ? forecast[0] : null;
    const attrs = stateObj.attributes;
    const temp = Math.round(attrs.temperature ?? 0);
    const humidity = attrs.humidity;
    const windSpeed = attrs.wind_speed;
    const windUnit = attrs.wind_speed_unit || 'km/h';
    const tempUnit = hass.config?.unit_system?.temperature || '°C';
    const condition = stateObj.state;
    const condInfo = CONDITION_MAP[condition] || CONDITION_MAP['cloudy'];
    const night = isNightTime(hass);
    const conditionText = localize(`weather.conditions.${condition}`) || condition;
    const lang = hass.locale?.language || hass.language || 'en';
    const timeFormat = hass.locale?.time_format ?? 'language';

    // Pick icon (night variant if available and it's night)
    const iconName = (night && condInfo.iconNight) ? condInfo.iconNight : condInfo.icon;
    const iconUrl = `${METEOCONS_BASE}/${iconName}.svg`;

    // Pick gradient (use night gradient for night conditions)
    const gradient = (night && condition !== 'clear-night')
      ? ['#0D1B2A', '#1B3A5C']
      : condInfo.gradient;

    // === OUTER CARD ===
    const card = document.createElement('div');
    card.className = 'apple-weather-card';
    card.style.setProperty('--weather-tint', gradient[0]);
    card.addEventListener('click', () => {
      card.dispatchEvent(new CustomEvent('hass-more-info', {
        detail: { entityId: weatherEntity }, bubbles: true, composed: true,
      }));
    });

    // === INNER LAYOUT: two-column on desktop, stacked on mobile ===
    const inner = document.createElement('div');
    inner.className = 'weather-card-inner';

    // --- LEFT: Clock ---
    const clockSide = document.createElement('div');
    clockSide.className = 'weather-clock-side';

    const timeEl = document.createElement('div');
    timeEl.className = 'weather-clock-time';

    const dateEl = document.createElement('div');
    dateEl.className = 'weather-clock-date';

    const updateClock = () => {
      const now = new Date();
      // HA time_format values: 'language', 'system', '12', '24'
      if (timeFormat === '12') {
        timeEl.textContent = now.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit', hour12: true });
      } else if (timeFormat === '24') {
        timeEl.textContent = now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
      } else {
        // 'language' or 'system' - let the locale decide
        timeEl.textContent = now.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' });
      }

      dateEl.textContent = now.toLocaleDateString(lang, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    };

    updateClock();
    this.clockInterval = setInterval(updateClock, 15000);

    clockSide.appendChild(timeEl);
    clockSide.appendChild(dateEl);
    inner.appendChild(clockSide);

    // --- RIGHT: Weather content ---
    const weatherSide = document.createElement('div');
    weatherSide.className = 'weather-content-side';

    // Hero row: Icon + Temp + Condition
    const hero = document.createElement('div');
    hero.className = 'weather-hero';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'weather-icon-wrap';
    const iconImg = document.createElement('img');
    iconImg.className = 'weather-icon-img';
    iconImg.src = iconUrl;
    iconImg.alt = conditionText;
    iconImg.loading = 'lazy';
    iconImg.onerror = () => {
      iconWrap.innerHTML = `<ha-icon icon="${MDI_ICONS[condition] || 'mdi:weather-cloudy'}" class="weather-icon-fallback"></ha-icon>`;
    };
    iconWrap.appendChild(iconImg);
    hero.appendChild(iconWrap);

    const heroInfo = document.createElement('div');
    heroInfo.className = 'weather-hero-info';

    const tempEl = document.createElement('div');
    tempEl.className = 'weather-temp';
    tempEl.textContent = `${temp}°`;
    const unitSpan = document.createElement('span');
    unitSpan.className = 'weather-temp-unit';
    unitSpan.textContent = tempUnit === '°F' ? 'F' : 'C';
    tempEl.appendChild(unitSpan);
    heroInfo.appendChild(tempEl);

    const condEl = document.createElement('div');
    condEl.className = 'weather-condition';
    condEl.textContent = conditionText;
    heroInfo.appendChild(condEl);

    if (todayForecast) {
      const high = todayForecast.temperature != null ? Math.round(todayForecast.temperature) : '--';
      const low = todayForecast.templow != null ? Math.round(todayForecast.templow) : '--';
      const hlEl = document.createElement('div');
      hlEl.className = 'weather-hi-lo';
      hlEl.textContent = `${localize('weather.high')}:${high}°  ${localize('weather.low')}:${low}°`;
      heroInfo.appendChild(hlEl);
    }

    hero.appendChild(heroInfo);
    weatherSide.appendChild(hero);

    // Detail pills: Humidity + Wind
    if (humidity != null || windSpeed != null) {
      const details = document.createElement('div');
      details.className = 'weather-details';

      if (humidity != null) {
        const hum = document.createElement('div');
        hum.className = 'weather-detail-pill';
        hum.innerHTML = `<ha-icon icon="mdi:water-percent"></ha-icon><span>${localize('weather.humidity')} ${humidity}%</span>`;
        details.appendChild(hum);
      }
      if (windSpeed != null) {
        const wind = document.createElement('div');
        wind.className = 'weather-detail-pill';
        wind.innerHTML = `<ha-icon icon="mdi:weather-windy"></ha-icon><span>${localize('weather.wind')} ${Math.round(windSpeed)} ${windUnit}</span>`;
        details.appendChild(wind);
      }

      weatherSide.appendChild(details);
    }

    inner.appendChild(weatherSide);
    card.appendChild(inner);

    // === FORECAST (full-width below both columns) ===
    const forecastDays = forecast.slice(1, 6);
    if (forecastDays.length > 0) {
      const forecastContainer = document.createElement('div');
      forecastContainer.className = 'weather-forecast';

      let globalMin = Infinity;
      let globalMax = -Infinity;
      for (const day of forecastDays) {
        if (day.templow != null) globalMin = Math.min(globalMin, day.templow);
        if (day.temperature != null) globalMax = Math.max(globalMax, day.temperature);
      }
      if (todayForecast?.templow != null) globalMin = Math.min(globalMin, todayForecast.templow);
      if (todayForecast?.temperature != null) globalMax = Math.max(globalMax, todayForecast.temperature);
      const range = globalMax - globalMin || 1;

      for (const day of forecastDays) {
        const row = document.createElement('div');
        row.className = 'forecast-row';

        const date = new Date(day.datetime);
        const dayName = date.toLocaleDateString(lang, { weekday: 'short' });
        const dayHigh = day.temperature != null ? Math.round(day.temperature) : null;
        const dayLow = day.templow != null ? Math.round(day.templow) : null;
        const dayIconName = this.getMeteoconName(day.condition || 'cloudy');
        const dayIconUrl = `${METEOCONS_BASE}/${dayIconName}.svg`;

        const nameEl = document.createElement('span');
        nameEl.className = 'forecast-day-name';
        nameEl.textContent = dayName;
        row.appendChild(nameEl);

        const smallIcon = document.createElement('img');
        smallIcon.className = 'forecast-icon';
        smallIcon.src = dayIconUrl;
        smallIcon.alt = day.condition || '';
        smallIcon.loading = 'lazy';
        smallIcon.onerror = () => {
          const fallback = document.createElement('ha-icon');
          fallback.setAttribute('icon', MDI_ICONS[day.condition || ''] || 'mdi:weather-cloudy');
          fallback.className = 'forecast-icon-fallback';
          smallIcon.replaceWith(fallback);
        };
        row.appendChild(smallIcon);

        const lowEl = document.createElement('span');
        lowEl.className = 'forecast-temp-low';
        lowEl.textContent = dayLow != null ? `${dayLow}°` : '--';
        row.appendChild(lowEl);

        const barWrap = document.createElement('div');
        barWrap.className = 'forecast-bar-wrap';
        const barBg = document.createElement('div');
        barBg.className = 'forecast-bar-bg';
        const barFill = document.createElement('div');
        barFill.className = 'forecast-bar-fill';

        if (dayLow != null && dayHigh != null) {
          const left = ((dayLow - globalMin) / range) * 100;
          const right = ((dayHigh - globalMin) / range) * 100;
          barFill.style.left = `${left}%`;
          barFill.style.width = `${right - left}%`;
          barFill.style.background = `linear-gradient(to right, ${tempToColor(dayLow)}, ${tempToColor(dayHigh)})`;
        }
        barBg.appendChild(barFill);
        barWrap.appendChild(barBg);
        row.appendChild(barWrap);

        const highEl = document.createElement('span');
        highEl.className = 'forecast-temp-high';
        highEl.textContent = dayHigh != null ? `${dayHigh}°` : '--';
        row.appendChild(highEl);

        forecastContainer.appendChild(row);
      }

      card.appendChild(forecastContainer);
    }

    container.appendChild(card);
  }

  private getMeteoconName(condition: string): string {
    const info = CONDITION_MAP[condition];
    return info ? info.icon : 'overcast';
  }

  private async fetchForecast(hass: any, entityId: string, stateObj: any): Promise<ForecastDay[]> {
    if (
      this.forecastCache &&
      this.forecastCache.entityId === entityId &&
      Date.now() - this.forecastCache.timestamp < WeatherSection.CACHE_TTL
    ) {
      return this.forecastCache.data;
    }

    // `weather/get_forecasts` (one-shot) was removed on some HA versions in favor of
    // `weather/subscribe_forecast` (subscription-only) - try the older, cheaper call
    // first for backward compatibility, then fall back to subscribing for one event.
    try {
      const result = await hass.callWS({
        type: 'weather/get_forecasts',
        entity_id: entityId,
        forecast_type: 'daily',
      });
      const forecasts: ForecastDay[] = result?.[entityId]?.forecast || [];
      if (forecasts.length > 0) {
        this.forecastCache = { entityId, data: forecasts, timestamp: Date.now() };
        return forecasts;
      }
    } catch {
      // WS command not available on this HA version
    }

    try {
      const forecasts = await this.subscribeForecastOnce(hass, entityId);
      if (forecasts.length > 0) {
        this.forecastCache = { entityId, data: forecasts, timestamp: Date.now() };
        return forecasts;
      }
    } catch {
      // Subscription not available either
    }

    const attrForecast = stateObj.attributes?.forecast;
    if (Array.isArray(attrForecast) && attrForecast.length > 0) {
      this.forecastCache = { entityId, data: attrForecast, timestamp: Date.now() };
      return attrForecast;
    }

    return [];
  }

  /**
   * Subscribes to `weather/subscribe_forecast` just long enough to grab one
   * forecast payload, then unsubscribes - a one-shot fetch built on top of the
   * subscription-only API that current HA versions require.
   */
  private subscribeForecastOnce(hass: any, entityId: string): Promise<ForecastDay[]> {
    return new Promise((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let settled = false;

      const finish = (result: ForecastDay[] | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe?.();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };

      const timeoutId = setTimeout(() => finish(new Error('Forecast subscription timed out')), 5000);

      hass.connection
        .subscribeMessage(
          (event: { forecast?: ForecastDay[] }) => finish(event?.forecast || []),
          { type: 'weather/subscribe_forecast', entity_id: entityId, forecast_type: 'daily' }
        )
        .then((unsub: () => void) => {
          unsubscribe = unsub;
          if (settled) unsub();
        })
        .catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
    });
  }

  private injectStyles(container: HTMLElement): void {
    const shadowRoot = container.getRootNode() as ShadowRoot;
    if (!shadowRoot || !(shadowRoot instanceof ShadowRoot)) return;
    if (shadowRoot.querySelector('#apple-weather-section-styles')) return;

    const style = document.createElement('style');
    style.id = 'apple-weather-section-styles';
    style.textContent = `
      /* ========== WEATHER CARD (Liquid Glass) ========== */
      .apple-weather-card {
        border-radius: var(--apple-card-radius, 22px);
        padding: 20px 22px 16px;
        margin-top: 20px;
        color: white;
        cursor: pointer;
        transition: transform 0.2s ease;
        -webkit-tap-highlight-color: transparent;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
        position: relative;
        overflow: hidden;
        background: var(--apple-card-bg-inactive, rgba(0, 0, 0, 0.3));
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        width: fit-content;
        max-width: 100%;
        box-sizing: border-box;
      }

      /* Subtle condition-aware color tint */
      .apple-weather-card::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at 30% 20%, var(--weather-tint, transparent) 0%, transparent 70%);
        opacity: 0.15;
        pointer-events: none;
      }

      .apple-weather-card:active {
        transform: scale(0.99);
      }

      /* ========== INNER LAYOUT: side-by-side on desktop, stacked on mobile ========== */
      .weather-card-inner {
        display: flex;
        flex-direction: row;
        gap: 24px;
        align-items: center;
        position: relative;
      }

      /* ========== CLOCK SIDE ========== */
      .weather-clock-side {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
        padding-right: 24px;
        border-right: 1px solid rgba(255, 255, 255, 0.1);
      }

      .weather-clock-time {
        font-size: 48px;
        font-weight: 600;
        color: white;
        line-height: 1.1;
        letter-spacing: -1px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .weather-clock-date {
        font-size: 15px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.55);
        margin-top: 4px;
        letter-spacing: 0.2px;
        text-transform: capitalize;
        white-space: nowrap;
      }

      /* ========== WEATHER CONTENT SIDE ========== */
      .weather-content-side {
        flex: 1;
        min-width: 0;
      }

      /* ========== HERO ROW ========== */
      .weather-hero {
        display: flex;
        align-items: center;
        gap: 10px;
        position: relative;
      }

      .weather-icon-wrap {
        flex-shrink: 0;
        width: 100px;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
      }

      .weather-icon-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .weather-icon-fallback {
        --mdc-icon-size: 48px;
        color: white;
      }

      .weather-hero-info {
        min-width: 0;
      }

      .weather-temp {
        font-size: 44px;
        font-weight: 100;
        line-height: 1;
        letter-spacing: -2px;
        position: relative;
      }

      .weather-temp-unit {
        font-size: 16px;
        font-weight: 300;
        letter-spacing: 0;
        vertical-align: super;
        margin-left: 1px;
        opacity: 0.7;
      }

      .weather-condition {
        font-size: 15px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        margin-top: 2px;
        text-transform: capitalize;
      }

      .weather-hi-lo {
        font-size: 13px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.55);
        margin-top: 1px;
        letter-spacing: 0.3px;
      }

      /* ========== DETAIL PILLS ========== */
      .weather-details {
        display: flex;
        gap: 6px;
        margin-top: 10px;
        flex-wrap: wrap;
      }

      .weather-detail-pill {
        display: flex;
        align-items: center;
        gap: 4px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.85);
      }

      .weather-detail-pill ha-icon {
        --mdc-icon-size: 14px;
        color: rgba(255, 255, 255, 0.65);
      }

      /* ========== FORECAST (full width below both columns) ========== */
      .weather-forecast {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: relative;
      }

      .forecast-row {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 26px;
      }

      .forecast-day-name {
        width: 34px;
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.85);
        text-transform: capitalize;
        flex-shrink: 0;
      }

      .forecast-icon {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        object-fit: contain;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
      }

      .forecast-icon-fallback {
        --mdc-icon-size: 18px;
        color: rgba(255, 255, 255, 0.8);
      }

      .forecast-temp-low {
        width: 28px;
        text-align: right;
        font-size: 13px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.5);
        flex-shrink: 0;
      }

      .forecast-temp-high {
        width: 28px;
        text-align: left;
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.95);
        flex-shrink: 0;
      }

      .forecast-bar-wrap {
        flex: 1;
        min-width: 50px;
        height: 4px;
        position: relative;
      }

      .forecast-bar-bg {
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 2px;
        overflow: hidden;
      }

      .forecast-bar-fill {
        position: absolute;
        top: 0;
        bottom: 0;
        border-radius: 2px;
        transition: width 0.6s ease, left 0.6s ease;
      }

      /* ========== RESPONSIVE: stacked on mobile ========== */
      @container apple-home-view (max-width: 555px) {
        .apple-weather-card {
          width: 100%;
          max-height: calc(100svh - 170px);
          overflow: hidden;
        }

        .weather-card-inner {
          flex-direction: column;
          gap: 10px;
          align-items: center;
          text-align: center;
        }

        .weather-clock-side {
          padding-right: 0;
          border-right: none;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          width: 100%;
          align-items: center;
        }

        .weather-content-side {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .weather-hero {
          justify-content: center;
        }

        .weather-details {
          justify-content: center;
        }

        .weather-clock-time {
          font-size: 38px;
        }

        .weather-clock-date {
          font-size: 14px;
          margin-top: 2px;
        }

        .weather-icon-wrap {
          width: 60px;
          height: 60px;
        }

        .weather-temp {
          font-size: 36px;
        }

        .weather-condition {
          font-size: 14px;
        }

        .weather-hi-lo {
          font-size: 12px;
        }

        .weather-detail-pill {
          font-size: 11px;
          padding: 3px 9px;
        }

        .weather-forecast {
          display: none;
        }
      }

      @container apple-home-view (max-width: 355px) {
        .weather-clock-time {
          font-size: 32px;
        }
        .weather-clock-date {
          font-size: 13px;
        }
        .weather-temp {
          font-size: 30px;
        }
        .weather-icon-wrap {
          width: 50px;
          height: 50px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .apple-weather-card,
        .forecast-bar-fill {
          transition: none !important;
        }
      }
    `;
    shadowRoot.appendChild(style);
  }
}
