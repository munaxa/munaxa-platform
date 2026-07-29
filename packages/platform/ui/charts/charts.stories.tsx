import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AreaChart, BarChart, Chart, LineChart, PieChart } from './index.js';
import { Sparkline } from '../components/data-display/sparkline.js';
import { StatCard } from '../patterns/stat-card.js';
import { ChartCard, KpiGrid } from '../patterns/dashboard.js';
import { Button } from '../components/primitives/button.js';
import { Container } from '../layouts/container.js';
import { Grid } from '../layouts/grid.js';
import { Stack } from '../layouts/stack.js';
import { Section } from '../layouts/page.js';

const MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

const ENROLMENT = [1180, 1204, 1211, 1198, 1240, 1256, 1249, 1263, 1271, 1288];
const LEAVERS = [12, 9, 14, 22, 8, 6, 11, 7, 5, 4];

const meta = {
  title: 'Data/Charts & Dashboards',
  parameters: {
    docs: {
      description: {
        component:
          'Apache ECharts, wrapped in the platform’s theme, states and accessibility.\n\n' +
          '**No chart contains a colour.** The ECharts theme is built by reading `--chart-1` … ' +
          '`--chart-10` and the semantic roles off the live document, so a chart matches the badge ' +
          'next to it, flips with dark mode, and changes when a different product imports a ' +
          'different palette — with nothing in the chart code changing.\n\n' +
          '**The picture is not the content.** Every chart renders its numbers as a visually-hidden ' +
          'table alongside the graphic. A summary is not equivalent access; a navigable table is.\n\n' +
          '**Division of labour.** The platform owns the wrapper, the theme, resizing, ' +
          'accessibility and the states. Products own the data, the query and what it means.\n\n' +
          '**Sparklines are deliberately not ECharts** — a full instance for a sixty-pixel line, ' +
          'twenty to a dashboard, is an order of magnitude more machinery than the drawing needs.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: function Gallery() {
    return (
      <Container width="wide" className="py-6">
        <Grid cols={{ base: 1, lg: 2 }} gap={4}>
          <ChartCard title="Enrolment" description="Headcount at the end of each month">
            <LineChart
              aria-label="Enrolment by month"
              categories={MONTHS}
              series={[{ name: 'Enrolled', data: ENROLMENT }]}
              smooth
              height={240}
            />
          </ChartCard>

          <ChartCard title="Enrolment against target" footnote="Target set in the September board">
            <AreaChart
              aria-label="Enrolment against target"
              categories={MONTHS}
              series={[{ name: 'Enrolled', data: ENROLMENT }]}
              reference={{ value: 1250, label: 'Target' }}
              height={240}
            />
          </ChartCard>

          <ChartCard title="Movement" description="Joiners and leavers, stacked">
            <BarChart
              aria-label="Movement by month"
              categories={MONTHS}
              series={[
                { name: 'Joined', data: [24, 33, 21, 9, 50, 22, 4, 21, 13, 21] },
                { name: 'Left', data: LEAVERS },
              ]}
              stacked
              height={240}
            />
          </ChartCard>

          <ChartCard title="By department" description="Share of headcount">
            <PieChart
              aria-label="Headcount by department"
              slices={[
                { name: 'Science', value: 412 },
                { name: 'Arts', value: 318 },
                { name: 'Sport', value: 164 },
                { name: 'Administration', value: 221 },
                { name: 'Facilities', value: 173 },
              ]}
              height={240}
            />
          </ChartCard>
        </Grid>
      </Container>
    );
  },
};

/** Long category labels read far better along the x-axis. */
export const Horizontal: Story = {
  render: function Horizontal() {
    return (
      <Container width="content" className="py-6">
        <ChartCard title="Attendance by year group">
          <BarChart
            aria-label="Attendance by year group"
            horizontal
            categories={[
              'Year 7 — Foundation',
              'Year 8 — Lower',
              'Year 9 — Middle',
              'Year 10 — Upper',
              'Year 11 — Leaving',
            ]}
            series={[{ name: 'Attendance', data: [96, 94, 91, 89, 93] }]}
            valueFormatter={(value) => `${value}%`}
            height={260}
          />
        </ChartCard>
      </Container>
    );
  },
};

/** Every state a dashboard actually shows. */
export const States: Story = {
  render: function States() {
    const [loading, setLoading] = useState(true);
    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <Button variant="outline" onClick={() => setLoading((value) => !value)}>
            {loading ? 'Finish loading' : 'Load again'}
          </Button>
          <Grid cols={{ base: 1, lg: 2 }} gap={4}>
            <ChartCard title="Loading">
              <LineChart
                aria-label="Loading example"
                categories={MONTHS}
                series={[{ name: 'Enrolled', data: ENROLMENT }]}
                loading={loading}
                height={220}
              />
            </ChartCard>
            <ChartCard title="Empty">
              <LineChart
                aria-label="Empty example"
                categories={[]}
                series={[]}
                empty
                height={220}
              />
            </ChartCard>
          </Grid>
        </Stack>
      </Container>
    );
  },
};

/**
 * KPI tiles.
 *
 * `goodWhen` is the field that matters: a rise is not inherently good news. Attendance going up is
 * good; absences going up is not, and colouring every increase green tells half the dashboard the
 * opposite of the truth.
 */
export const Kpis: Story = {
  render: function Kpis() {
    return (
      <Container width="wide" className="py-6">
        <KpiGrid>
          <StatCard
            label="Students"
            value="1,288"
            delta={{ value: 17, goodWhen: 'up', comparison: 'vs last month' }}
            trend={ENROLMENT}
          />
          <StatCard
            label="Absences"
            value="31"
            tone="warning"
            delta={{ value: 4, goodWhen: 'down', label: '+4', comparison: 'vs last week' }}
            trend={[18, 22, 19, 27, 24, 31]}
          />
          <StatCard
            label="Attendance"
            value="94.2%"
            tone="success"
            delta={{ value: -0.4, goodWhen: 'up', label: '−0.4pp' }}
            trend={[95, 95, 94, 95, 94, 94]}
          />
          <StatCard label="Staff" value="146" hint="of 152 posts" />
          <StatCard
            label="Outstanding fees"
            value="12,480 JOD"
            tone="danger"
            delta={{ value: -1200, goodWhen: 'down', label: '−1,200 JOD' }}
          />
        </KpiGrid>
      </Container>
    );
  },
};

/** A whole dashboard, composed from the primitives with nothing bespoke. */
export const Dashboard: Story = {
  render: function Dashboard() {
    return (
      <Container width="wide" className="py-6">
        <Stack gap={6}>
          <Section title="This term" description="Everything below is Platform composition only.">
            <KpiGrid>
              <StatCard
                label="Students"
                value="1,288"
                delta={{ value: 17, goodWhen: 'up' }}
                trend={ENROLMENT}
              />
              <StatCard
                label="Attendance"
                value="94.2%"
                tone="success"
                trend={[95, 95, 94, 95, 94]}
              />
              <StatCard
                label="Absences"
                value="31"
                tone="warning"
                delta={{ value: 4, goodWhen: 'down' }}
              />
              <StatCard label="Staff" value="146" />
              <StatCard label="Fees due" value="12,480" tone="danger" />
            </KpiGrid>
          </Section>

          <Grid cols={{ base: 1, xl: 3 }} gap={4}>
            <ChartCard
              title="Enrolment"
              className="xl:col-span-2"
              actions={<Button variant="ghost">This year</Button>}
            >
              <AreaChart
                aria-label="Enrolment by month"
                categories={MONTHS}
                series={[{ name: 'Enrolled', data: ENROLMENT }]}
                reference={{ value: 1250, label: 'Target' }}
                height={220}
              />
            </ChartCard>
            <ChartCard title="Departments">
              <PieChart
                aria-label="Headcount by department"
                slices={[
                  { name: 'Science', value: 412 },
                  { name: 'Arts', value: 318 },
                  { name: 'Sport', value: 164 },
                  { name: 'Administration', value: 221 },
                ]}
                height={220}
              />
            </ChartCard>
          </Grid>
        </Stack>
      </Container>
    );
  },
};

/**
 * `Chart` takes a raw ECharts option, so a wrapper is never a bottleneck. Anything ECharts can
 * draw — a gauge, a sankey, a custom series — gets the theme, the resizing and the accessible
 * table without starting a second charting integration.
 */
export const RawOption: Story = {
  name: 'Escape hatch: a raw option',
  render: function RawOption() {
    return (
      <Container width="content" className="py-6">
        <ChartCard title="Capacity" description="A gauge — no wrapper exists, and none is needed.">
          <Chart
            aria-label="Capacity used"
            height={240}
            data={[{ label: 'Capacity used', values: [{ series: 'Percent', value: 84 }] }]}
            option={{
              series: [
                {
                  type: 'gauge',
                  progress: { show: true, width: 14 },
                  axisLine: { lineStyle: { width: 14 } },
                  axisLabel: { distance: 18 },
                  detail: { valueAnimation: true, formatter: '{value}%', fontSize: 24 },
                  data: [{ value: 84 }],
                },
              ],
            }}
          />
        </ChartCard>
      </Container>
    );
  },
};

/** The inline trend line, on its own. */
export const Sparklines: Story = {
  render: function Sparklines() {
    return (
      <Container width="content" className="py-6">
        <Stack gap={4}>
          {(['primary', 'success', 'warning', 'danger', 'muted'] as const).map((tone) => (
            <div key={tone} className="flex items-center gap-4">
              <span className="w-20 text-sm text-muted-foreground">{tone}</span>
              <Sparkline values={ENROLMENT} tone={tone} showLast />
              <Sparkline values={ENROLMENT} tone={tone} area width={160} height={40} />
            </div>
          ))}
        </Stack>
      </Container>
    );
  },
};
