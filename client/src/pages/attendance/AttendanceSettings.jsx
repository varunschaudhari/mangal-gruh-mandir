import PageHeader from '../../components/ui/PageHeader.jsx';
import AttendanceSettingsPanel from './AttendanceSettingsPanel.jsx';

export default function AttendanceSettings() {
  return (
    <div>
      <PageHeader title="Shifts & Machine" breadcrumbs={[{ label: 'Attendance' }, { label: 'Shifts & Machine' }]} />
      <AttendanceSettingsPanel />
    </div>
  );
}
