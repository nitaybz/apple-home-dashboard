import { CustomizationManager } from '../utils/CustomizationManager';
import { localize } from '../utils/LocalizationService';

interface EnergyPrefs {
  energy_sources?: Array<{
    type: string;
    stat_energy_from?: string;
    stat_energy_to?: string;
    stat_compensation?: string;
    entity_energy_from?: string;
    entity_energy_to?: string;
    flow_from?: Array<{ stat_energy_from: string; stat_cost?: string }>;
    flow_to?: Array<{ stat_energy_to: string; stat_compensation?: string }>;
    stat_energy_price?: string;
    config_entry_solar_forecast?: string[];
  }>;
  device_consumption?: Array<{ stat_consumption: string }>;
}

interface BarData {
  label: string;
  value: number;
}

interface EnergyData {
  currentPower: number | null;
  todayTotal: number | null;
  hourlyData: BarData[];
  solarPower: number | null;
  solarToday: number | null;
  batteryPercent: number | null;
  gridReturn: number | null;
  hasSolar: boolean;
  hasBattery: boolean;
  gridEntityId: string | null;
}

interface FullEnergyData {
  currentPower: number | null;
  periodTotal: number | null;
  previousPeriodTotal: number | null;
  barData: BarData[];
  solarPower: number | null;
  solarPeriodTotal: number | null;
  solarBarData: BarData[];
  batteryPercent: number | null;
  batteryCharged: number | null;
  batteryDischarged: number | null;
  gridReturn: number | null;
  selfSufficiency: number | null;
  hasSolar: boolean;
  hasBattery: boolean;
  hasGridReturn: boolean;
  devices: DeviceConsumption[];
  costTotal: number | null;
}

interface DeviceConsumption {
  entityId: string;
  name: string;
  consumption: number;
  percentage: number;
}

type Period = 'day' | 'week' | 'month';

export class EnergySection {
  private customizationManager: CustomizationManager;
  private prefsCache: { data: EnergyPrefs; timestamp: number } | null = null;
  private periodStatsCache: Map<string, { data: any; timestamp: number }> = new Map();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static cachedGridEntityIds: string[] | null = null;

  private selectedPeriod: Period = 'day';
  private currentContainer: HTMLElement | null = null;
  private currentHass: any = null;

  constructor(customizationManager: CustomizationManager) {
    this.customizationManager = customizationManager;
  }

  async render(container: HTMLElement, hass: any, context: 'home' | 'group' = 'home'): Promise<void> {
    this.currentContainer = container;
    this.currentHass = hass;

    if (context === 'group') {
      await this.renderFullPage(container, hass);
    } else {
      await this.renderHomeCard(container, hass);
    }
  }

  // ==================== HOME CARD (compact) ====================

  private async renderHomeCard(container: HTMLElement, hass: any): Promise<void> {
    const energyData = await this.fetchEnergyData(hass);
    if (!energyData || (energyData.currentPower === null && energyData.todayTotal === null && energyData.hourlyData.length === 0)) {
      return;
    }

    this.injectStyles(container);

    const card = document.createElement('div');
    card.className = 'apple-energy-card';
    card.addEventListener('click', () => {
      window.history.pushState(null, '', '/energy');
      window.dispatchEvent(new Event('location-changed', { bubbles: true, composed: true }));
    });

    // Header row
    const header = document.createElement('div');
    header.className = 'energy-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'energy-header-left';
    headerLeft.innerHTML = `<ha-icon icon="mdi:flash" class="energy-icon"></ha-icon><span class="energy-label">${localize('energy.current_usage')}</span>`;

    const headerRight = document.createElement('div');
    headerRight.className = 'energy-header-right';
    headerRight.textContent = localize('energy.today');

    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    card.appendChild(header);

    // Main values row
    const values = document.createElement('div');
    values.className = 'energy-values';

    const currentPowerEl = document.createElement('div');
    currentPowerEl.className = 'energy-current-power';
    currentPowerEl.textContent = energyData.currentPower !== null ? this.formatPower(energyData.currentPower) : '--';

    const todayEl = document.createElement('div');
    todayEl.className = 'energy-today-total';
    todayEl.textContent = energyData.todayTotal !== null ? this.formatEnergy(energyData.todayTotal) : '--';

    values.appendChild(currentPowerEl);
    values.appendChild(todayEl);
    card.appendChild(values);

    // Bar chart
    if (energyData.hourlyData.length > 0) {
      const chartContainer = this.renderBarChart(energyData.hourlyData, 'day');
      card.appendChild(chartContainer);
    }

    // Solar / Battery row
    if (energyData.hasSolar || energyData.hasBattery) {
      const extraRow = document.createElement('div');
      extraRow.className = 'energy-extra-row';

      if (energyData.hasSolar) {
        const solarEl = document.createElement('div');
        solarEl.className = 'energy-extra-item';
        const solarPowerText = energyData.solarPower !== null ? this.formatPower(energyData.solarPower) : '--';
        solarEl.innerHTML = `
          <div class="energy-extra-main"><ha-icon icon="mdi:solar-power" class="energy-extra-icon solar"></ha-icon><span>${localize('energy.solar')} ${solarPowerText}</span></div>
        `;
        extraRow.appendChild(solarEl);
      }

      if (energyData.hasBattery) {
        const batteryEl = document.createElement('div');
        batteryEl.className = 'energy-extra-item';
        const batteryText = energyData.batteryPercent !== null ? `${Math.round(energyData.batteryPercent)}%` : '--';
        batteryEl.innerHTML = `
          <div class="energy-extra-main"><ha-icon icon="mdi:battery" class="energy-extra-icon battery"></ha-icon><span>${localize('energy.battery')} ${batteryText}</span></div>
        `;
        extraRow.appendChild(batteryEl);
      }

      card.appendChild(extraRow);
    }

    container.appendChild(card);
  }

  // ==================== FULL PAGE (energy dashboard) ====================

  private async renderFullPage(container: HTMLElement, hass: any): Promise<void> {
    this.injectStyles(container);

    const wrapper = document.createElement('div');
    wrapper.className = 'energy-full-page';

    // Current usage header
    const currentHeader = document.createElement('div');
    currentHeader.className = 'energy-page-current';
    const prefs = await this.getEnergyPrefs(hass);
    const gridSource = prefs?.energy_sources?.find((s: any) => s.type === 'grid');
    const gridFromEntities = gridSource?.flow_from?.map((f: any) => f.stat_energy_from) || [];
    const currentPower = this.findCurrentPower(hass, gridFromEntities);

    currentHeader.innerHTML = `
      <div class="energy-page-current-left">
        <ha-icon icon="mdi:flash" class="energy-page-icon"></ha-icon>
        <span class="energy-page-current-label">${localize('energy.current_usage')}</span>
      </div>
      <div class="energy-page-current-value">${currentPower !== null ? this.formatPower(currentPower) : '--'}</div>
    `;
    wrapper.appendChild(currentHeader);

    // Period selector
    this.renderPeriodSelector(wrapper);

    // Dynamic content area (charts, stats, devices)
    const dynamicArea = document.createElement('div');
    dynamicArea.className = 'energy-dynamic-area';
    wrapper.appendChild(dynamicArea);

    container.appendChild(wrapper);

    // Load initial data
    await this.updateDynamicContent(dynamicArea, hass);
  }

  private renderPeriodSelector(parent: HTMLElement): void {
    const selector = document.createElement('div');
    selector.className = 'energy-period-selector';

    const periods: Period[] = ['day', 'week', 'month'];
    for (const period of periods) {
      const btn = document.createElement('button');
      btn.className = `energy-period-btn${period === this.selectedPeriod ? ' active' : ''}`;
      btn.textContent = localize(`energy.${period}`);
      btn.addEventListener('click', () => {
        if (period === this.selectedPeriod) return;
        this.selectedPeriod = period;
        // Update active state
        selector.querySelectorAll('.energy-period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.handlePeriodChange();
      });
      selector.appendChild(btn);
    }

    parent.appendChild(selector);
  }

  private async handlePeriodChange(): Promise<void> {
    if (!this.currentContainer || !this.currentHass) return;
    const dynamicArea = this.currentContainer.querySelector('.energy-dynamic-area') as HTMLElement;
    if (!dynamicArea) return;

    // Fade out
    dynamicArea.style.opacity = '0';
    await new Promise(resolve => setTimeout(resolve, 200));

    await this.updateDynamicContent(dynamicArea, this.currentHass);

    // Fade in
    requestAnimationFrame(() => {
      dynamicArea.style.opacity = '1';
    });
  }

  private async updateDynamicContent(dynamicArea: HTMLElement, hass: any): Promise<void> {
    dynamicArea.innerHTML = '';

    const data = await this.fetchFullEnergyData(hass, this.selectedPeriod);
    if (!data) {
      dynamicArea.innerHTML = `<div class="energy-no-data">${localize('energy.no_data')}</div>`;
      return;
    }

    // Summary stats row
    this.renderSummaryStats(dynamicArea, data);

    // Main consumption chart
    if (data.barData.length > 0) {
      this.renderConsumptionChart(dynamicArea, data.barData, this.selectedPeriod);
    }

    // Flow cards (solar, battery, grid return, self-sufficiency)
    const hasFlowCards = data.hasSolar || data.hasBattery || data.hasGridReturn;
    if (hasFlowCards) {
      const flowGrid = document.createElement('div');
      flowGrid.className = 'energy-flow-grid';

      if (data.hasSolar) {
        this.renderSolarCard(flowGrid, data);
      }
      if (data.hasBattery) {
        this.renderBatteryCard(flowGrid, data);
      }
      if (data.hasGridReturn) {
        this.renderGridReturnCard(flowGrid, data);
      }
      if (data.hasSolar && data.selfSufficiency !== null) {
        this.renderSelfSufficiencyCard(flowGrid, data.selfSufficiency);
      }

      dynamicArea.appendChild(flowGrid);
    }

    // Device breakdown
    if (data.devices.length > 0) {
      this.renderDeviceBreakdown(dynamicArea, data.devices);
    }
  }

  private renderSummaryStats(parent: HTMLElement, data: FullEnergyData): void {
    const stats = document.createElement('div');
    stats.className = 'energy-summary-stats';

    // Total consumption
    const totalStat = document.createElement('div');
    totalStat.className = 'energy-stat';
    totalStat.innerHTML = `
      <div class="energy-stat-label">${localize('energy.total_consumption')}</div>
      <div class="energy-stat-value">${data.periodTotal !== null ? this.formatEnergy(data.periodTotal) : '--'}</div>
    `;
    stats.appendChild(totalStat);

    // Cost (if available)
    if (data.costTotal !== null) {
      const costStat = document.createElement('div');
      costStat.className = 'energy-stat';
      costStat.innerHTML = `
        <div class="energy-stat-label">${localize('energy.cost')}</div>
        <div class="energy-stat-value">${this.formatCost(data.costTotal)}</div>
      `;
      stats.appendChild(costStat);
    }

    // Comparison to previous period
    if (data.previousPeriodTotal !== null && data.periodTotal !== null && data.previousPeriodTotal > 0) {
      const diff = ((data.periodTotal - data.previousPeriodTotal) / data.previousPeriodTotal) * 100;
      const sign = diff >= 0 ? '+' : '';
      const color = diff <= 0 ? '#4ADE80' : '#FF6B6B';
      const compStat = document.createElement('div');
      compStat.className = 'energy-stat';
      compStat.innerHTML = `
        <div class="energy-stat-label">${localize('energy.vs_previous')}</div>
        <div class="energy-stat-value" style="color: ${color}">${sign}${diff.toFixed(0)}%</div>
      `;
      stats.appendChild(compStat);
    }

    parent.appendChild(stats);
  }

  private renderConsumptionChart(parent: HTMLElement, barData: BarData[], period: Period): void {
    const section = document.createElement('div');
    section.className = 'energy-chart-section';

    const chart = this.renderBarChart(barData, period);
    section.appendChild(chart);

    parent.appendChild(section);
  }

  private renderSolarCard(parent: HTMLElement, data: FullEnergyData): void {
    const card = document.createElement('div');
    card.className = 'energy-flow-card';

    const solarPowerText = data.solarPower !== null ? this.formatPower(data.solarPower) : '--';
    const solarTotalText = data.solarPeriodTotal !== null ? this.formatEnergy(data.solarPeriodTotal) : '--';

    card.innerHTML = `
      <div class="flow-card-header">
        <ha-icon icon="mdi:solar-power" class="flow-card-icon solar"></ha-icon>
        <span class="flow-card-title">${localize('energy.solar_production')}</span>
      </div>
      <div class="flow-card-values">
        <div class="flow-card-primary">${solarPowerText}</div>
        <div class="flow-card-secondary">${solarTotalText}</div>
      </div>
    `;

    if (data.solarBarData.length > 0) {
      const miniChart = this.renderMiniBarChart(data.solarBarData, '#FFD60A');
      card.appendChild(miniChart);
    }

    parent.appendChild(card);
  }

  private renderBatteryCard(parent: HTMLElement, data: FullEnergyData): void {
    const card = document.createElement('div');
    card.className = 'energy-flow-card';

    const pct = data.batteryPercent !== null ? Math.round(data.batteryPercent) : null;
    const chargedText = data.batteryCharged !== null ? this.formatEnergy(data.batteryCharged) : '--';
    const dischargedText = data.batteryDischarged !== null ? this.formatEnergy(data.batteryDischarged) : '--';

    card.innerHTML = `
      <div class="flow-card-header">
        <ha-icon icon="mdi:battery" class="flow-card-icon battery"></ha-icon>
        <span class="flow-card-title">${localize('energy.battery_status')}</span>
      </div>
      <div class="flow-card-values">
        <div class="flow-card-primary">${pct !== null ? `${pct}%` : '--'}</div>
      </div>
      <div class="battery-bar-container">
        <div class="battery-bar-fill" style="width: ${pct ?? 0}%"></div>
      </div>
      <div class="battery-charge-stats">
        <span>${localize('energy.charged')}: ${chargedText}</span>
        <span>${localize('energy.discharged')}: ${dischargedText}</span>
      </div>
    `;

    parent.appendChild(card);
  }

  private renderGridReturnCard(parent: HTMLElement, data: FullEnergyData): void {
    const card = document.createElement('div');
    card.className = 'energy-flow-card';

    card.innerHTML = `
      <div class="flow-card-header">
        <ha-icon icon="mdi:transmission-tower-export" class="flow-card-icon grid-return"></ha-icon>
        <span class="flow-card-title">${localize('energy.returned_to_grid')}</span>
      </div>
      <div class="flow-card-values">
        <div class="flow-card-primary">${data.gridReturn !== null ? this.formatEnergy(data.gridReturn) : '--'}</div>
      </div>
    `;

    parent.appendChild(card);
  }

  private renderSelfSufficiencyCard(parent: HTMLElement, pct: number): void {
    const card = document.createElement('div');
    card.className = 'energy-flow-card self-sufficiency';

    const roundedPct = Math.round(pct);
    const circumference = 2 * Math.PI * 36;
    const dashOffset = circumference - (circumference * roundedPct / 100);

    card.innerHTML = `
      <div class="flow-card-header">
        <ha-icon icon="mdi:circle-half-full" class="flow-card-icon sufficiency"></ha-icon>
        <span class="flow-card-title">${localize('energy.self_sufficiency')}</span>
      </div>
      <div class="self-sufficiency-ring">
        <svg viewBox="0 0 80 80" class="sufficiency-svg">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="5"/>
          <circle cx="40" cy="40" r="36" fill="none" stroke="#4ADE80" stroke-width="5"
            stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
            stroke-linecap="round" transform="rotate(-90 40 40)"/>
        </svg>
        <div class="sufficiency-pct">${roundedPct}%</div>
      </div>
    `;

    parent.appendChild(card);
  }

  private renderDeviceBreakdown(parent: HTMLElement, devices: DeviceConsumption[]): void {
    const section = document.createElement('div');
    section.className = 'energy-devices-section';

    const title = document.createElement('div');
    title.className = 'energy-devices-title';
    title.textContent = localize('energy.devices');
    section.appendChild(title);

    for (const device of devices) {
      const row = document.createElement('div');
      row.className = 'energy-device-row';

      row.innerHTML = `
        <div class="device-row-info">
          <span class="device-row-name">${device.name}</span>
          <span class="device-row-value">${this.formatEnergy(device.consumption)}</span>
        </div>
        <div class="device-row-bar-container">
          <div class="device-row-bar-fill" style="width: ${device.percentage}%"></div>
        </div>
        <div class="device-row-pct">${Math.round(device.percentage)}%</div>
      `;

      section.appendChild(row);
    }

    parent.appendChild(section);
  }

  // ==================== BAR CHART RENDERING ====================

  private renderBarChart(barData: BarData[], period: Period): HTMLElement {
    const chart = document.createElement('div');
    chart.className = 'energy-chart';

    const barsContainer = document.createElement('div');
    barsContainer.className = 'energy-bars';

    const maxValue = Math.max(...barData.map(d => d.value), 0.001);
    const currentHour = new Date().getHours();

    for (let i = 0; i < barData.length; i++) {
      const d = barData[i];
      const heightPercent = (d.value / maxValue) * 100;

      const bar = document.createElement('div');
      bar.className = 'energy-bar';

      // Mark current and future bars for day view
      if (period === 'day') {
        if (i === currentHour) bar.classList.add('current');
        if (i > currentHour) bar.classList.add('future');
      } else if (period === 'week') {
        const today = new Date().getDay();
        // barData is ordered from 6 days ago to today
        if (i === barData.length - 1) bar.classList.add('current');
      } else {
        // month: last bar is today
        if (i === barData.length - 1) bar.classList.add('current');
      }

      const barFill = document.createElement('div');
      barFill.className = 'energy-bar-fill';
      barFill.style.height = `${Math.max(heightPercent, 2)}%`;

      bar.appendChild(barFill);
      barsContainer.appendChild(bar);
    }

    chart.appendChild(barsContainer);

    // Time labels
    const labels = document.createElement('div');
    labels.className = 'energy-chart-labels';

    if (period === 'day') {
      const labelValues = [
        { pos: 0, text: '00' },
        { pos: 6, text: '06' },
        { pos: 12, text: '12' },
        { pos: 18, text: '18' },
        { pos: currentHour, text: localize('energy.now') }
      ];
      // Deduplicate
      const unique = labelValues.reduce((acc, l) => {
        if (!acc.find(a => a.pos === l.pos)) acc.push(l);
        else if (l.text === localize('energy.now')) {
          const ex = acc.find(a => a.pos === l.pos);
          if (ex) ex.text = l.text;
        }
        return acc;
      }, [] as typeof labelValues).sort((a, b) => a.pos - b.pos);

      for (const label of unique) {
        const el = document.createElement('span');
        el.className = 'energy-chart-label';
        if (label.text === localize('energy.now')) el.classList.add('now');
        el.style.left = `${(label.pos / 23) * 100}%`;
        el.textContent = label.text;
        labels.appendChild(el);
      }
    } else {
      // For week/month, show labels at start/middle/end
      const lang = this.currentHass?.locale?.language || this.currentHass?.language || 'en';
      const total = barData.length;
      const indices = total <= 7
        ? barData.map((_, i) => i) // show all for week
        : [0, Math.floor(total / 4), Math.floor(total / 2), Math.floor(3 * total / 4), total - 1];

      for (const idx of indices) {
        const el = document.createElement('span');
        el.className = 'energy-chart-label';
        if (idx === total - 1) el.classList.add('now');
        el.style.left = `${(idx / Math.max(total - 1, 1)) * 100}%`;
        el.textContent = barData[idx]?.label || '';
        labels.appendChild(el);
      }
    }

    chart.appendChild(labels);
    return chart;
  }

  private renderMiniBarChart(barData: BarData[], color: string): HTMLElement {
    const chart = document.createElement('div');
    chart.className = 'energy-mini-chart';

    const maxVal = Math.max(...barData.map(d => d.value), 0.001);

    for (const d of barData) {
      const bar = document.createElement('div');
      bar.className = 'energy-mini-bar';
      const h = (d.value / maxVal) * 100;
      bar.style.height = `${Math.max(h, 2)}%`;
      bar.style.background = color;
      chart.appendChild(bar);
    }

    return chart;
  }

  // ==================== FORMATTING ====================

  private formatPower(watts: number): string {
    if (watts >= 1000) {
      return `${(watts / 1000).toFixed(1)} kW`;
    }
    return `${Math.round(watts)} W`;
  }

  private formatEnergy(kwh: number): string {
    return `${kwh.toFixed(1)} kWh`;
  }

  private formatCost(cost: number): string {
    return `$${cost.toFixed(2)}`;
  }

  // ==================== DATA FETCHING ====================

  private async fetchEnergyData(hass: any): Promise<EnergyData | null> {
    try {
      const prefs = await this.getEnergyPrefs(hass);
      if (!prefs?.energy_sources?.length) return null;

      const gridSource = prefs.energy_sources.find((s: any) => s.type === 'grid');
      const solarSource = prefs.energy_sources.find((s: any) => s.type === 'solar');
      const batterySource = prefs.energy_sources.find((s: any) => s.type === 'battery');

      if (!gridSource) return null;

      const gridFromEntities = gridSource.flow_from?.map((f: any) => f.stat_energy_from) || [];
      const currentPower = this.findCurrentPower(hass, gridFromEntities);

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const stats = await this.fetchPeriodStatistics(hass, gridFromEntities, startOfDay, now, 'hour');

      let todayTotal = 0;
      const hourlyData: BarData[] = [];

      if (stats) {
        // Initialize all 24 hours
        for (let h = 0; h < 24; h++) {
          hourlyData.push({ label: h.toString().padStart(2, '0'), value: 0 });
        }
        for (const entityId of gridFromEntities) {
          const entityStats = stats[entityId];
          if (!entityStats) continue;
          for (const stat of entityStats) {
            const hour = new Date(stat.start).getHours();
            const change = stat.change ?? 0;
            todayTotal += change;
            hourlyData[hour].value += change;
          }
        }
      }

      // Solar
      let solarPower: number | null = null;
      let solarToday: number | null = null;
      if (solarSource) {
        const solarEntity = (solarSource as any).stat_energy_from;
        if (solarEntity) {
          solarPower = this.findCurrentPower(hass, [solarEntity]);
          const solarStats = await this.fetchPeriodStatistics(hass, [solarEntity], startOfDay, now, 'hour');
          if (solarStats?.[solarEntity]) {
            solarToday = solarStats[solarEntity].reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
          }
        }
      }

      // Battery
      let batteryPercent: number | null = null;
      if (batterySource) {
        const battFromEntity = (batterySource as any).stat_energy_from;
        if (battFromEntity) {
          batteryPercent = this.findBatterySoc(hass, battFromEntity);
        }
      }

      // Grid return
      const gridToEntities = gridSource.flow_to?.map((f: any) => f.stat_energy_to) || [];
      let gridReturn: number | null = null;
      if (gridToEntities.length > 0) {
        const returnStats = await this.fetchPeriodStatistics(hass, gridToEntities, startOfDay, now, 'hour');
        if (returnStats) {
          gridReturn = 0;
          for (const entityId of gridToEntities) {
            const entityStats = returnStats[entityId];
            if (entityStats) {
              gridReturn += entityStats.reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
            }
          }
        }
      }

      return {
        currentPower,
        todayTotal: todayTotal > 0 ? todayTotal : null,
        hourlyData,
        solarPower,
        solarToday,
        batteryPercent,
        gridReturn,
        hasSolar: !!solarSource,
        hasBattery: !!batterySource,
        gridEntityId: gridFromEntities[0] || null
      };
    } catch (err) {
      console.error('EnergySection: Error fetching energy data:', err);
      return null;
    }
  }

  private async fetchFullEnergyData(hass: any, period: Period): Promise<FullEnergyData | null> {
    try {
      const prefs = await this.getEnergyPrefs(hass);
      if (!prefs?.energy_sources?.length) return null;

      const gridSource = prefs.energy_sources.find((s: any) => s.type === 'grid');
      const solarSource = prefs.energy_sources.find((s: any) => s.type === 'solar');
      const batterySource = prefs.energy_sources.find((s: any) => s.type === 'battery');

      if (!gridSource) return null;

      const gridFromEntities = gridSource.flow_from?.map((f: any) => f.stat_energy_from) || [];
      const gridToEntities = gridSource.flow_to?.map((f: any) => f.stat_energy_to) || [];
      const costEntities = gridSource.flow_from?.map((f: any) => f.stat_cost).filter(Boolean) || [];

      const currentPower = this.findCurrentPower(hass, gridFromEntities);

      const { start, end, statPeriod } = this.getStartDateForPeriod(period);
      const { start: prevStart, end: prevEnd } = this.getPreviousPeriodDates(period);
      const lang = hass.locale?.language || hass.language || 'en';

      // Fetch all stats in parallel
      const allEntities = [...gridFromEntities];
      const solarEntity = solarSource ? (solarSource as any).stat_energy_from : null;
      if (solarEntity) allEntities.push(solarEntity);
      const battFromEntity = batterySource ? (batterySource as any).stat_energy_from : null;
      const battToEntity = batterySource ? (batterySource as any).stat_energy_to : null;
      if (battFromEntity) allEntities.push(battFromEntity);
      if (battToEntity) allEntities.push(battToEntity);
      allEntities.push(...gridToEntities);
      allEntities.push(...costEntities);

      const [currentStats, prevStats, deviceData] = await Promise.all([
        this.fetchPeriodStatistics(hass, allEntities, start, end, statPeriod),
        this.fetchPeriodStatistics(hass, gridFromEntities, prevStart, prevEnd, statPeriod),
        this.fetchDeviceConsumption(hass, prefs, start, end, statPeriod)
      ]);

      // Process grid consumption
      let periodTotal = 0;
      const barDataMap = new Map<string, number>();

      if (currentStats) {
        for (const entityId of gridFromEntities) {
          const entityStats = currentStats[entityId];
          if (!entityStats) continue;
          for (const stat of entityStats) {
            const change = stat.change ?? 0;
            periodTotal += change;
            const key = this.getBarLabel(stat.start, period, lang);
            barDataMap.set(key, (barDataMap.get(key) || 0) + change);
          }
        }
      }

      // Build bar data array
      const barData: BarData[] = [];
      if (period === 'day') {
        for (let h = 0; h < 24; h++) {
          const label = h.toString().padStart(2, '0');
          barData.push({ label, value: barDataMap.get(label) || 0 });
        }
      } else {
        // For week/month, iterate through the map in order
        const allLabels = this.generatePeriodLabels(period, start, lang);
        for (const label of allLabels) {
          barData.push({ label, value: barDataMap.get(label) || 0 });
        }
      }

      // Previous period total
      let previousPeriodTotal: number | null = null;
      if (prevStats) {
        previousPeriodTotal = 0;
        for (const entityId of gridFromEntities) {
          const entityStats = prevStats[entityId];
          if (entityStats) {
            previousPeriodTotal += entityStats.reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
          }
        }
      }

      // Cost
      let costTotal: number | null = null;
      if (costEntities.length > 0 && currentStats) {
        costTotal = 0;
        for (const costEntity of costEntities) {
          const costStats = currentStats[costEntity];
          if (costStats) {
            costTotal += costStats.reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
          }
        }
        if (costTotal === 0) costTotal = null;
      }

      // Solar
      let solarPower: number | null = null;
      let solarPeriodTotal: number | null = null;
      const solarBarData: BarData[] = [];
      if (solarEntity && currentStats?.[solarEntity]) {
        solarPower = this.findCurrentPower(hass, [solarEntity]);
        solarPeriodTotal = 0;
        const solarMap = new Map<string, number>();
        for (const stat of currentStats[solarEntity]) {
          const change = stat.change ?? 0;
          solarPeriodTotal += change;
          const key = this.getBarLabel(stat.start, period, lang);
          solarMap.set(key, (solarMap.get(key) || 0) + change);
        }
        if (period === 'day') {
          for (let h = 0; h < 24; h++) {
            const label = h.toString().padStart(2, '0');
            solarBarData.push({ label, value: solarMap.get(label) || 0 });
          }
        } else {
          const labels = this.generatePeriodLabels(period, start, lang);
          for (const label of labels) {
            solarBarData.push({ label, value: solarMap.get(label) || 0 });
          }
        }
      }

      // Battery
      let batteryPercent: number | null = null;
      let batteryCharged: number | null = null;
      let batteryDischarged: number | null = null;
      if (batterySource) {
        if (battFromEntity) {
          batteryPercent = this.findBatterySoc(hass, battFromEntity);
          if (currentStats?.[battFromEntity]) {
            batteryDischarged = currentStats[battFromEntity].reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
          }
        }
        if (battToEntity && currentStats?.[battToEntity]) {
          batteryCharged = currentStats[battToEntity].reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
        }
      }

      // Grid return
      let gridReturn: number | null = null;
      if (gridToEntities.length > 0 && currentStats) {
        gridReturn = 0;
        for (const entityId of gridToEntities) {
          const entityStats = currentStats[entityId];
          if (entityStats) {
            gridReturn += entityStats.reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
          }
        }
      }

      // Self-sufficiency
      let selfSufficiency: number | null = null;
      if (solarPeriodTotal !== null && solarPeriodTotal > 0 && periodTotal > 0) {
        const solarUsed = solarPeriodTotal - (gridReturn || 0);
        selfSufficiency = Math.min(100, Math.max(0, (solarUsed / periodTotal) * 100));
      }

      return {
        currentPower,
        periodTotal: periodTotal > 0 ? periodTotal : null,
        previousPeriodTotal,
        barData,
        solarPower,
        solarPeriodTotal,
        solarBarData,
        batteryPercent,
        batteryCharged,
        batteryDischarged,
        gridReturn,
        selfSufficiency,
        hasSolar: !!solarSource,
        hasBattery: !!batterySource,
        hasGridReturn: gridToEntities.length > 0,
        devices: deviceData,
        costTotal
      };
    } catch (err) {
      console.error('EnergySection: Error fetching full energy data:', err);
      return null;
    }
  }

  private async fetchDeviceConsumption(hass: any, prefs: EnergyPrefs, start: Date, end: Date, period: string): Promise<DeviceConsumption[]> {
    if (!prefs.device_consumption?.length) return [];

    const deviceEntityIds = prefs.device_consumption.map(d => d.stat_consumption);
    const stats = await this.fetchPeriodStatistics(hass, deviceEntityIds, start, end, period);
    if (!stats) return [];

    let totalConsumption = 0;
    const devices: DeviceConsumption[] = [];

    for (const devicePref of prefs.device_consumption) {
      const entityId = devicePref.stat_consumption;
      const entityStats = stats[entityId];
      if (!entityStats) continue;

      const consumption = entityStats.reduce((sum: number, s: any) => sum + (s.change ?? 0), 0);
      if (consumption <= 0) continue;

      totalConsumption += consumption;

      // Get friendly name
      const stateObj = hass.states[entityId];
      const name = stateObj?.attributes?.friendly_name || entityId.split('.').pop() || entityId;

      devices.push({ entityId, name, consumption, percentage: 0 });
    }

    // Calculate percentages and sort
    if (totalConsumption > 0) {
      for (const device of devices) {
        device.percentage = (device.consumption / totalConsumption) * 100;
      }
    }

    return devices.sort((a, b) => b.consumption - a.consumption);
  }

  private async getEnergyPrefs(hass: any): Promise<EnergyPrefs | null> {
    if (this.prefsCache && Date.now() - this.prefsCache.timestamp < EnergySection.CACHE_TTL) {
      return this.prefsCache.data;
    }
    try {
      const prefs = await hass.callWS({ type: 'energy/get_prefs' });
      this.prefsCache = { data: prefs, timestamp: Date.now() };

      // Cache grid entity IDs statically so getTotalPower can use them
      const gridSource = prefs?.energy_sources?.find((s: any) => s.type === 'grid');
      EnergySection.cachedGridEntityIds = gridSource?.flow_from?.map((f: any) => f.stat_energy_from) || null;

      return prefs;
    } catch {
      return null;
    }
  }

  private async fetchPeriodStatistics(hass: any, entityIds: string[], start: Date, end: Date, period: string): Promise<any> {
    if (!entityIds.length) return null;

    const cacheKey = `${period}:${start.getTime()}:${entityIds.sort().join(',')}`;
    const cached = this.periodStatsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < EnergySection.CACHE_TTL) {
      return cached.data;
    }

    try {
      const result = await hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        statistic_ids: entityIds,
        period: period,
        types: ['change']
      });
      this.periodStatsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch {
      return null;
    }
  }

  // ==================== DATE HELPERS ====================

  private getStartDateForPeriod(period: Period): { start: Date; end: Date; statPeriod: string } {
    const now = new Date();
    const end = now;

    if (period === 'day') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start, end, statPeriod: 'hour' };
    } else if (period === 'week') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { start, end, statPeriod: 'day' };
    } else {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return { start, end, statPeriod: 'day' };
    }
  }

  private getPreviousPeriodDates(period: Period): { start: Date; end: Date } {
    const now = new Date();

    if (period === 'day') {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      return { start, end };
    } else if (period === 'week') {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end };
    } else {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end };
    }
  }

  private getBarLabel(startTime: string, period: Period, lang: string): string {
    const date = new Date(startTime);
    if (period === 'day') {
      return date.getHours().toString().padStart(2, '0');
    } else if (period === 'week') {
      return date.toLocaleDateString(lang, { weekday: 'short' });
    } else {
      return `${date.getDate()}`;
    }
  }

  private generatePeriodLabels(period: Period, start: Date, lang: string): string[] {
    const labels: string[] = [];
    const now = new Date();

    if (period === 'week') {
      for (let i = 0; i < 7; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        labels.push(d.toLocaleDateString(lang, { weekday: 'short' }));
      }
    } else {
      // month
      const days = Math.ceil((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        labels.push(`${d.getDate()}`);
      }
    }

    return labels;
  }

  // ==================== ENTITY HELPERS ====================

  private findCurrentPower(hass: any, energyEntityIds: string[]): number | null {
    let totalPower = 0;
    let found = false;
    const seenDevices = new Set<string>();

    for (const energyEntityId of energyEntityIds) {
      const entityRegistry = hass.entities?.[energyEntityId];
      if (!entityRegistry?.device_id) continue;
      // Multiple energy entities (e.g. day/night tariffs) can share one physical
      // meter device; only count that device's power sensor once.
      if (seenDevices.has(entityRegistry.device_id)) continue;

      for (const [eid, reg] of Object.entries(hass.entities || {})) {
        const r = reg as any;
        if (r.device_id !== entityRegistry.device_id) continue;
        if (eid === energyEntityId) continue;

        const state = hass.states[eid];
        if (!state) continue;
        if (state.attributes?.device_class !== 'power') continue;
        if (state.attributes?.state_class === undefined) continue;

        const val = parseFloat(state.state);
        if (!isNaN(val)) {
          totalPower += val;
          found = true;
          seenDevices.add(entityRegistry.device_id);
          break;
        }
      }
    }

    return found ? totalPower : null;
  }

  private findBatterySoc(hass: any, batteryEnergyEntity: string): number | null {
    const entityRegistry = hass.entities?.[batteryEnergyEntity];
    if (!entityRegistry?.device_id) return null;

    for (const [eid, reg] of Object.entries(hass.entities || {})) {
      const r = reg as any;
      if (r.device_id !== entityRegistry.device_id) continue;
      const state = hass.states[eid];
      if (!state) continue;
      if (state.attributes?.device_class === 'battery') {
        const val = parseFloat(state.state);
        if (!isNaN(val)) return val;
      }
    }
    return null;
  }

  // ==================== STATIC HELPERS ====================

  static hasEnergySensors(hass: any): boolean {
    if (!hass?.states) return false;
    for (const entityId of Object.keys(hass.states)) {
      if (!entityId.startsWith('sensor.')) continue;
      const state = hass.states[entityId];
      const dc = state?.attributes?.device_class;
      if ((dc === 'energy' || dc === 'power') && state?.attributes?.state_class) {
        return true;
      }
    }
    return false;
  }

  static getTotalPower(hass: any): number | null {
    if (!hass?.states) return null;

    // Strategy 1: Use cached grid entity IDs from energy prefs (same as full page)
    if (EnergySection.cachedGridEntityIds && EnergySection.cachedGridEntityIds.length > 0 && hass.entities) {
      let total = 0;
      let found = false;
      const seenDevices = new Set<string>();

      for (const energyEntityId of EnergySection.cachedGridEntityIds) {
        const entityRegistry = hass.entities[energyEntityId] as any;
        if (!entityRegistry?.device_id) continue;
        // Multiple grid flow entities (e.g. day/night tariffs) can share one
        // physical meter device; only count that device's power sensor once.
        if (seenDevices.has(entityRegistry.device_id)) continue;

        for (const [eid, reg] of Object.entries(hass.entities || {})) {
          const r = reg as any;
          if (r.device_id !== entityRegistry.device_id) continue;
          if (eid === energyEntityId) continue;
          const state = hass.states[eid];
          if (!state) continue;
          if (state.attributes?.device_class !== 'power') continue;
          if (state.attributes?.state_class === undefined) continue;
          const val = parseFloat(state.state);
          if (!isNaN(val)) {
            total += val;
            found = true;
            seenDevices.add(entityRegistry.device_id);
            break; // take first power sensor per grid device
          }
        }
      }

      if (found) return total;
    }

    // Strategy 2: Find power sensors on the same device as energy sensors
    if (hass.entities) {
      const energyEntityIds: string[] = [];
      for (const entityId of Object.keys(hass.states)) {
        if (!entityId.startsWith('sensor.')) continue;
        const state = hass.states[entityId];
        if (state?.attributes?.device_class !== 'energy') continue;
        if (state?.attributes?.state_class !== 'total_increasing') continue;
        const reg = hass.entities[entityId] as any;
        if (reg?.entity_category || reg?.hidden_by || reg?.disabled_by) continue;
        energyEntityIds.push(entityId);
      }

      if (energyEntityIds.length > 0) {
        let total = 0;
        let found = false;
        const seenDevices = new Set<string>();

        for (const energyEntityId of energyEntityIds) {
          const reg = hass.entities[energyEntityId] as any;
          if (!reg?.device_id || seenDevices.has(reg.device_id)) continue;
          seenDevices.add(reg.device_id);

          for (const [eid, entityReg] of Object.entries(hass.entities || {})) {
            const r = entityReg as any;
            if (r.device_id !== reg.device_id || eid === energyEntityId) continue;
            const state = hass.states[eid];
            if (!state || state.attributes?.device_class !== 'power') continue;
            if (!state.attributes?.state_class) continue;
            const val = parseFloat(state.state);
            if (!isNaN(val) && val >= 0) {
              total += val;
              found = true;
              break; // take first power sensor per device
            }
          }
        }

        if (found) return total;
      }
    }

    // Strategy 3: Fall back to summing all power sensors
    let total = 0;
    let found = false;
    for (const entityId of Object.keys(hass.states)) {
      if (!entityId.startsWith('sensor.')) continue;
      const state = hass.states[entityId];
      if (state?.attributes?.device_class !== 'power') continue;
      if (!state?.attributes?.state_class) continue;
      const reg = hass.entities?.[entityId] as any;
      if (reg?.entity_category === 'config' || reg?.entity_category === 'diagnostic') continue;
      if (reg?.hidden_by || reg?.disabled_by) continue;

      const val = parseFloat(state.state);
      if (!isNaN(val) && val >= 0) {
        total += val;
        found = true;
      }
    }
    return found ? total : null;
  }

  // ==================== STYLES ====================

  private injectStyles(container: HTMLElement): void {
    const shadowRoot = container.getRootNode() as ShadowRoot;
    if (!shadowRoot || !(shadowRoot instanceof ShadowRoot)) return;
    if (shadowRoot.querySelector('#apple-energy-section-styles')) return;

    const style = document.createElement('style');
    style.id = 'apple-energy-section-styles';
    style.textContent = `
      /* ========== ENERGY CARD (Home - Liquid Glass) ========== */
      .apple-energy-card {
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
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }

      .apple-energy-card:active {
        transform: scale(0.99);
      }

      /* ========== HEADER ========== */
      .energy-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }

      .energy-header-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .energy-icon {
        --mdc-icon-size: 20px;
        color: #4ADE80;
      }

      .energy-label {
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
      }

      .energy-header-right {
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.5);
      }

      /* ========== VALUES ========== */
      .energy-values {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 16px;
      }

      .energy-current-power {
        font-size: 42px;
        font-weight: 200;
        line-height: 1;
        letter-spacing: -2px;
        color: white;
      }

      .energy-today-total {
        font-size: 16px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.55);
      }

      /* ========== BAR CHART ========== */
      .energy-chart {
        margin-bottom: 12px;
        position: relative;
      }

      .energy-bars {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 60px;
      }

      .energy-bar {
        flex: 1;
        display: flex;
        align-items: flex-end;
        height: 100%;
      }

      .energy-bar-fill {
        width: 100%;
        background: #4ADE80;
        border-radius: 2px 2px 0 0;
        min-height: 1px;
        transition: height 0.3s ease;
        opacity: 0.7;
      }

      .energy-bar.current .energy-bar-fill {
        opacity: 1;
        background: #30D158;
      }

      .energy-bar.future .energy-bar-fill {
        opacity: 0.15;
        height: 2% !important;
      }

      .energy-chart-labels {
        position: relative;
        height: 18px;
        margin-top: 4px;
      }

      .energy-chart-label {
        position: absolute;
        transform: translateX(-50%);
        font-size: 10px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.4);
      }

      .energy-chart-label.now {
        color: #4ADE80;
        font-weight: 600;
      }

      /* ========== SOLAR / BATTERY ROW (Home Card) ========== */
      .energy-extra-row {
        display: flex;
        gap: 20px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        flex-wrap: wrap;
      }

      .energy-extra-item {
        flex: 1;
        min-width: 120px;
      }

      .energy-extra-main {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
      }

      .energy-extra-icon {
        --mdc-icon-size: 16px;
      }

      .energy-extra-icon.solar {
        color: #FFD60A;
      }

      .energy-extra-icon.battery {
        color: #4ADE80;
      }

      .energy-extra-sub {
        font-size: 12px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.45);
        margin-top: 2px;
        margin-left: 22px;
      }

      /* ========== FULL PAGE STYLES ========== */
      .energy-full-page {
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
        color: white;
      }

      .energy-dynamic-area {
        transition: opacity 0.2s ease;
      }

      .energy-page-current {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        margin-bottom: 8px;
      }

      .energy-page-current-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .energy-page-icon {
        --mdc-icon-size: 24px;
        color: #4ADE80;
      }

      .energy-page-current-label {
        font-size: 18px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
      }

      .energy-page-current-value {
        font-size: 32px;
        font-weight: 200;
        letter-spacing: -1px;
        color: white;
      }

      /* ========== PERIOD SELECTOR ========== */
      .energy-period-selector {
        display: flex;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 3px;
        margin-bottom: 20px;
        gap: 2px;
      }

      .energy-period-btn {
        flex: 1;
        padding: 8px 16px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
      }

      .energy-period-btn.active {
        background: rgba(255, 255, 255, 0.2);
        color: white;
      }

      .energy-period-btn:active {
        transform: scale(0.97);
      }

      /* ========== SUMMARY STATS ========== */
      .energy-summary-stats {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }

      .energy-stat {
        flex: 1;
        min-width: 80px;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 14px;
        padding: 14px 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .energy-stat-label {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 4px;
      }

      .energy-stat-value {
        font-size: 20px;
        font-weight: 300;
        color: white;
        letter-spacing: -0.5px;
      }

      /* ========== CHART SECTION ========== */
      .energy-chart-section {
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 16px;
        padding: 16px;
        margin-bottom: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .energy-chart-section .energy-bars {
        height: 100px;
      }

      /* ========== FLOW CARDS GRID ========== */
      .energy-flow-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }

      .energy-flow-card {
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 16px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .flow-card-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
      }

      .flow-card-icon {
        --mdc-icon-size: 18px;
      }

      .flow-card-icon.solar {
        color: #FFD60A;
      }

      .flow-card-icon.battery {
        color: #4ADE80;
      }

      .flow-card-icon.grid-return {
        color: #5AC8FA;
      }

      .flow-card-icon.sufficiency {
        color: #4ADE80;
      }

      .flow-card-title {
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.7);
      }

      .flow-card-values {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .flow-card-primary {
        font-size: 24px;
        font-weight: 200;
        color: white;
        letter-spacing: -0.5px;
      }

      .flow-card-secondary {
        font-size: 14px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.5);
      }

      /* ========== BATTERY BAR ========== */
      .battery-bar-container {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
        margin: 10px 0 8px;
      }

      .battery-bar-fill {
        height: 100%;
        background: #4ADE80;
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      .battery-charge-stats {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.45);
      }

      /* ========== SELF SUFFICIENCY RING ========== */
      .self-sufficiency-ring {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 8px auto 0;
      }

      .sufficiency-svg {
        width: 100%;
        height: 100%;
      }

      .sufficiency-pct {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 300;
        color: white;
      }

      /* ========== MINI CHART (in flow cards) ========== */
      .energy-mini-chart {
        display: flex;
        align-items: flex-end;
        gap: 1px;
        height: 30px;
        margin-top: 10px;
      }

      .energy-mini-bar {
        flex: 1;
        border-radius: 1px 1px 0 0;
        min-height: 1px;
        opacity: 0.6;
      }

      /* ========== DEVICE BREAKDOWN ========== */
      .energy-devices-section {
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 16px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .energy-devices-title {
        font-size: 16px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin-bottom: 14px;
      }

      .energy-device-row {
        padding: 10px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      .energy-device-row:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .device-row-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }

      .device-row-name {
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.85);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        margin-right: 8px;
      }

      .device-row-value {
        font-size: 14px;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.55);
        flex-shrink: 0;
      }

      .device-row-bar-container {
        height: 4px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
        flex: 1;
      }

      .device-row-bar-fill {
        height: 100%;
        background: #4ADE80;
        border-radius: 2px;
        transition: width 0.3s ease;
        opacity: 0.8;
      }

      .device-row-pct {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.45);
        min-width: 32px;
        text-align: right;
        margin-top: 4px;
      }

      .energy-no-data {
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
        font-size: 14px;
        padding: 40px 0;
      }

      /* ========== RESPONSIVE ========== */
      @container apple-home-view (max-width: 755px) {
        .energy-flow-grid {
          grid-template-columns: 1fr;
        }
      }

      @container apple-home-view (max-width: 555px) {
        .apple-energy-card {
          width: 100%;
        }

        .energy-current-power {
          font-size: 34px;
        }

        .energy-today-total {
          font-size: 14px;
        }

        .energy-bars {
          height: 48px;
        }

        .energy-extra-row {
          flex-direction: column;
          gap: 10px;
        }

        .energy-page-current-value {
          font-size: 26px;
        }

        .energy-stat-value {
          font-size: 17px;
        }

        .energy-chart-section .energy-bars {
          height: 70px;
        }

        .flow-card-primary {
          font-size: 20px;
        }
      }

      @container apple-home-view (max-width: 355px) {
        .energy-current-power {
          font-size: 28px;
        }

        .energy-bars {
          height: 40px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .apple-energy-card,
        .energy-bar-fill,
        .battery-bar-fill,
        .device-row-bar-fill,
        .energy-period-btn,
        .energy-dynamic-area {
          transition: none !important;
        }
      }
    `;
    shadowRoot.appendChild(style);
  }
}
