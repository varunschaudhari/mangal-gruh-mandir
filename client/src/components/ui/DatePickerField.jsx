import { Controller } from 'react-hook-form';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { FormField } from './FormField.jsx';

const DatePickerField = ({ name, control, label, required, error, maxDate, minDate, allowFuture = false }) => (
  <FormField label={label} required={required} error={error}>
    <Controller
      name={name}
      control={control}
      rules={required ? { required: `${label} is required` } : undefined}
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
        />
      )}
    />
  </FormField>
);

export default DatePickerField;
