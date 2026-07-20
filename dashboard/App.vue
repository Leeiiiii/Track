<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { graphic, init, use, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { DataAnalysis, Document, Monitor, Refresh, Search, TrendCharts, User, View } from "@element-plus/icons-vue";

type Row = { name: string; count: number };
type Group = { label: string; rows: Row[] };
type Summary = { totals: { visits: number; visitors: number; sites: number; avgDuration: number }; groups: Group[] };

const loading = ref(true), loggingIn = ref(false), authenticated = ref(false);
const password = ref(""), loginError = ref(""), query = ref(""), active = ref(0);
const updatedAt = ref(""), summary = ref<Summary | null>(null), chartEl = ref<HTMLDivElement>();
use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
let chart: EChartsType | undefined;
const formatter = new Intl.NumberFormat("zh-CN");
const activeGroup = computed(() => summary.value?.groups[active.value]);
const tableRows = computed(() => (activeGroup.value?.rows ?? []).filter(row => row.name.toLowerCase().includes(query.value.toLowerCase())));
const metrics = computed(() => [
  { label: "总访问量", value: formatter.format(summary.value?.totals.visits ?? 0), note: "全部页面事件", icon: View, tone: "purple" },
  { label: "独立访客", value: formatter.format(summary.value?.totals.visitors ?? 0), note: "匿名访客去重", icon: User, tone: "blue" },
  { label: "接入站点", value: formatter.format(summary.value?.totals.sites ?? 0), note: "当前活跃站点", icon: Monitor, tone: "green" },
  { label: "平均停留", value: Math.round((summary.value?.totals.avgDuration ?? 0) / 1000) + " 秒", note: "有效停留均值", icon: TrendCharts, tone: "orange" }
]);

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const response = await fetch("/api/summary");
    if (response.status === 401) { authenticated.value = false; return; }
    if (!response.ok) throw new Error("load failed");
    summary.value = await response.json(); authenticated.value = true;
    updatedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    await nextTick(); renderChart();
  } finally { loading.value = false; }
}
async function login() {
  if (!password.value) return;
  loggingIn.value = true; loginError.value = "";
  try {
    const response = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: password.value }) });
    if (!response.ok) { loginError.value = "密码不正确，请重新输入"; return; }
    password.value = ""; await load();
  } catch { loginError.value = "网络异常，请稍后重试"; }
  finally { loggingIn.value = false; }
}
function selectGroup(index: number) { active.value = index; query.value = ""; }
function renderChart() {
  if (!chartEl.value || !activeGroup.value) return;
  chart ??= init(chartEl.value);
  const rows = activeGroup.value.rows.slice(0, 8);
  chart.setOption({
    animationDuration: 550,
    grid: { left: 12, right: 20, top: 18, bottom: 6, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, borderWidth: 0, backgroundColor: "#172033", textStyle: { color: "#fff" } },
    xAxis: { type: "value", splitLine: { lineStyle: { color: "#eef1f5" } }, axisLabel: { color: "#8a94a4" }, axisLine: { show: false } },
    yAxis: { type: "category", inverse: true, data: rows.map(x => x.name), axisLabel: { color: "#566174", width: 130, overflow: "truncate" }, axisTick: { show: false }, axisLine: { show: false } },
    series: [{ type: "bar", data: rows.map(x => x.count), barWidth: 13, itemStyle: { color: new graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: "#635bff" }, { offset: 1, color: "#9b96ff" }]), borderRadius: [0, 6, 6, 0] } }]
  }, true);
}
function resize() { chart?.resize(); }
watch(active, async () => { await nextTick(); renderChart(); });
onMounted(() => { load(); window.addEventListener("resize", resize); });
onBeforeUnmount(() => { window.removeEventListener("resize", resize); chart?.dispose(); });
</script>

<template>
  <div v-if="!authenticated && !loading" class="login-page">
    <section class="login-panel">
      <div class="brand"><span class="brand-mark"><DataAnalysis /></span><span>EdgeTrack</span></div>
      <el-form class="login-form" @submit.prevent="login">
        <h1>欢迎回来</h1><p>登录数据中心，查看站点实时访问表现。</p>
        <el-form-item label="管理密码" :error="loginError"><el-input v-model="password" type="password" size="large" show-password placeholder="请输入后台密码" @keyup.enter="login" /></el-form-item>
        <el-button type="primary" size="large" :loading="loggingIn" native-type="submit">进入数据中心</el-button>
      </el-form>
      <span class="copyright">EdgeTrack Analytics · 安全数据访问</span>
    </section>
    <aside class="login-visual"><div class="visual-copy"><el-tag effect="dark" round>实时分析</el-tag><h2>让每一次访问<br>都变得清晰可见</h2><p>统一洞察流量、访客与设备表现</p></div><div class="visual-card"><div v-for="n in 7" :key="n" :style="{height: (30+n*8)+'%'}"></div></div></aside>
  </div>
  <el-container v-else class="app-shell">
    <el-aside width="236px" class="sidebar">
      <div class="brand brand-light"><span class="brand-mark"><DataAnalysis /></span><span>EdgeTrack</span></div>
      <div class="menu-label">工作台</div>
      <el-menu default-active="overview" background-color="transparent" text-color="#9aa5b5" active-text-color="#fff">
        <el-menu-item index="overview"><el-icon><DataAnalysis /></el-icon><span>数据概览</span></el-menu-item>
        <el-menu-item index="sites" @click="selectGroup(0)"><el-icon><Monitor /></el-icon><span>站点分析</span></el-menu-item>
        <el-menu-item index="pages" @click="selectGroup(2)"><el-icon><Document /></el-icon><span>页面表现</span></el-menu-item>
        <el-menu-item index="devices" @click="selectGroup(7)"><el-icon><User /></el-icon><span>访客设备</span></el-menu-item>
      </el-menu>
      <div class="service-state"><i></i><span>服务运行正常</span></div>
    </el-aside>
    <el-container class="workspace">
      <el-header class="topbar"><strong>数据概览</strong><div class="header-actions"><span v-if="updatedAt">最后更新 {{ updatedAt }}</span><el-button :icon="Refresh" @click="load(true)">刷新数据</el-button><el-avatar :size="34">ET</el-avatar></div></el-header>
      <el-main class="main-content">
        <div class="page-title"><div><h1>数据概览</h1><p>掌握所有接入站点的核心访问数据与用户特征</p></div><el-tag type="success" effect="light" round>数据实时更新</el-tag></div>
        <el-skeleton :loading="loading" animated :rows="7">
          <div class="metric-grid"><el-card v-for="metric in metrics" :key="metric.label" shadow="never" class="metric-card"><div class="metric-head"><span>{{ metric.label }}</span><span class="metric-icon" :class="metric.tone"><component :is="metric.icon" /></span></div><strong>{{ metric.value }}</strong><small>{{ metric.note }}</small></el-card></div>
          <div class="dashboard-grid">
            <el-card shadow="never" class="chart-card"><template #header><div><strong>流量分布</strong><span>当前维度 Top 8</span></div></template><div ref="chartEl" class="chart"></div></el-card>
            <el-card shadow="never" class="profile-card"><template #header><strong>数据摘要</strong></template><el-progress type="dashboard" :percentage="summary?.totals.visits ? Math.min(100, Math.round((summary.totals.visitors / summary.totals.visits) * 100)) : 0" :width="150" color="#635bff"><template #default="{ percentage }"><b>{{ percentage }}%</b><span>访客占比</span></template></el-progress><div class="summary-line"><span>访问 / 访客</span><b>{{ formatter.format(summary?.totals.visits ?? 0) }} / {{ formatter.format(summary?.totals.visitors ?? 0) }}</b></div><div class="summary-line"><span>数据维度</span><b>{{ summary?.groups.length ?? 0 }} 个</b></div></el-card>
          </div>
          <el-card shadow="never" class="table-card"><template #header><div class="table-head"><div><strong>访问明细</strong><span>多维度访问排名与占比</span></div><el-input v-model="query" :prefix-icon="Search" placeholder="搜索当前维度" clearable /></div></template>
            <el-tabs :model-value="String(active)" @tab-change="value => selectGroup(Number(value))"><el-tab-pane v-for="(group,index) in summary?.groups" :key="group.label" :label="group.label" :name="String(index)" /></el-tabs>
            <el-table :data="tableRows" stripe empty-text="暂无匹配数据"><el-table-column type="index" label="排名" width="80" /><el-table-column prop="name" label="名称" min-width="260" show-overflow-tooltip /><el-table-column label="占比" min-width="210"><template #default="scope"><el-progress :percentage="activeGroup?.rows[0]?.count ? Math.round(scope.row.count / activeGroup.rows[0].count * 100) : 0" :stroke-width="7" :show-text="false" /></template></el-table-column><el-table-column label="访问量" width="140" align="right"><template #default="scope"><b>{{ formatter.format(scope.row.count) }}</b></template></el-table-column></el-table>
          </el-card>
        </el-skeleton>
      </el-main>
    </el-container>
  </el-container>
</template>
