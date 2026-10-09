import { Controller } from 'react-hook-form';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { FormField } from './FormField.jsx';
import { useIsMobile } from '../../hooks/useMediaQuery.js';
import { useT } from '../../i18n/index.jsx';

// Phones: calendar opens full-screen (portal) and the field doesn't summon the keyboard.
const DatePickerField = ({ name, control, label, required, error, maxDate, minDate, allowFuture = false }) => {
  const isMobile = useIsMobile();
  const t = useT();
  return (
    <FormField label={label} required={required} error={error}>
      <Controller
        name={name}
        control={control}
        rules={required ? { required: t('{label} is required', { label: t(label) }) } : undefined}
        render={({ field }) => (
          <DatePicker
            selected={field.value ? new Date(field.value) : null}
            onChange={(date) => field.onChange(date)}
            dateFormat="dd/MM/yyyy"
            maxDate={allowFuture ? undefined : (maxDate ?? new Date())}
            minDate={minDate}
            placeholderText="DD/MM/YYYY"
            className="input w-full"
            showMonthDropdown
            showYearDropdown
            dropdownMode="select"
            withPortal={isMobile}
            customInput={<input inputMode={isMobile ? 'none' : 'text'} />}
          />
        )}
      />
    </FormField>
  );
};

export default DatePickerField;
