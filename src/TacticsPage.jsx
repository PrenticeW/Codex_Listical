import React, { useMemo, useState } from 'react';
import NavigationBar from './NavigationBar';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MINUTES_IN_DAY = 24 * 60;

const formatHour12 = (hour, minutes = '00') => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${minutes} ${period}`;
};

const parseHour12ToMinutes = (value) => {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'AM') {
    hours = hours % 12;
  } else {
    hours = (hours % 12) + 12;
  }
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

export default function TacticsPage({ currentPath = '/tactics', onNavigate = () => {} }) {
  const [startDay, setStartDay] = useState(DAYS_OF_WEEK[0]);
  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, hour) => formatHour12(hour)),
    []
  );
  const [startHour, setStartHour] = useState('');
  const minuteOptions = useMemo(() => {
    if (!startHour) return [];
    const baseMinutes = parseHour12ToMinutes(startHour);
    if (baseMinutes == null) return [];
    const increments = 96;
    return Array.from({ length: increments }, (_, index) => {
      const totalMinutes = (baseMinutes + index * 15) % MINUTES_IN_DAY;
      const hour24 = Math.floor(totalMinutes / 60);
      const minutes = (totalMinutes % 60).toString().padStart(2, '0');
      return formatHour12(hour24, minutes);
    });
  }, [startHour]);
  const [startMinute, setStartMinute] = useState('');
  const [incrementMinutes, setIncrementMinutes] = useState(15);
  const hourRows = useMemo(() => {
    if (!startHour || !startMinute) return [];
    const startMinutes = parseHour12ToMinutes(startHour);
    const targetMinutes = parseHour12ToMinutes(startMinute);
    if (startMinutes == null || targetMinutes == null) return [];
    const startHourIndex = Math.floor(startMinutes / 60);
    const endHourIndex = Math.floor(targetMinutes / 60);
    const targetMinutesWithinHour = targetMinutes % 60;
    const shouldIncludeEndHour =
      targetMinutesWithinHour !== 0 && targetMinutesWithinHour % 15 === 0;

    const hours = [];
    let current = (startHourIndex + 1) % 24;
    for (let i = 0; i < 24; i += 1) {
      hours.push(current);
      if (current === endHourIndex) {
        if (!shouldIncludeEndHour) {
          hours.pop();
        }
        break;
      }
      current = (current + 1) % 24;
    }
    return hours;
  }, [startHour, startMinute]);
  const trailingMinuteRows = useMemo(() => {
    if (!startHour || !startMinute) return [];
    const startMinutes = parseHour12ToMinutes(startHour);
    const endMinutes = parseHour12ToMinutes(startMinute);
    if (startMinutes == null || endMinutes == null) return [];
    const step = incrementMinutes;
    const startTarget = (startMinutes + MINUTES_IN_DAY - step) % MINUTES_IN_DAY;
    const rows = [];
    let current = (endMinutes + step) % MINUTES_IN_DAY;
    for (let i = 0; i < Math.ceil(MINUTES_IN_DAY / step); i += 1) {
      rows.push(current);
      if (current === startTarget) break;
      current = (current + step) % MINUTES_IN_DAY;
      if (current === ((endMinutes + step) % MINUTES_IN_DAY)) break;
    }
    return rows;
  }, [startHour, startMinute, incrementMinutes]);
  const sequence = useMemo(() => {
    const startIndex = DAYS_OF_WEEK.indexOf(startDay);
    if (startIndex < 0) return [];
    return Array.from({ length: 6 }, (_, offset) => {
      const index = (startIndex + offset + 1) % DAYS_OF_WEEK.length;
      return DAYS_OF_WEEK[index];
    });
  }, [startDay]);
  const displayedWeekDays = useMemo(() => {
    if (!startDay) return DAYS_OF_WEEK.slice(0, 7);
    return [startDay, ...sequence].slice(0, 7);
  }, [startDay, sequence]);
  const placeholderSleepValues = useMemo(() => Array(7).fill(0), []);
  const placeholderSleepTotal = useMemo(
    () => placeholderSleepValues.reduce((sum, value) => sum + value, 0),
    [placeholderSleepValues]
  );

  return (
    <div className="min-h-screen bg-gray-100 text-slate-800 p-4">
      <NavigationBar
        currentPath={currentPath}
        onNavigate={onNavigate}
        listicalButton={
          <ListicalMenu
            incrementMinutes={incrementMinutes}
            onIncrementChange={setIncrementMinutes}
          />
        }
      />
      <div className="mt-20">
        <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm">
          <table className="w-full border-collapse text-[11px] text-slate-800">
            <tbody>
              <tr className="grid grid-cols-9 text-sm">
                {Array.from({ length: 9 }, (_, index) => {
                  if (index === 0 || index === 8) {
                    return (
                      <td
                        key={`blank-${index}`}
                        className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                      ></td>
                    );
                  }
                  if (index === 1) {
                    return (
                      <td key="selector" className="border border-[#e5e7eb] px-3 py-2">
                        <select
                          className="w-full rounded border border-[#ced3d0] bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          value={startDay}
                          onChange={(event) => setStartDay(event.target.value)}
                        >
                          {DAYS_OF_WEEK.map((day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  }
                  const dayIndex = index - 2;
                  return (
                    <td key={`day-${index}`} className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold">
                      {sequence[dayIndex] ?? ''}
                    </td>
                  );
                })}
              </tr>
              <tr className="grid grid-cols-9">
                <td className="border border-[#e5e7eb] px-3 py-2">
                  <select
                    className="w-full rounded border border-[#ced3d0] bg-white px-2 py-1 text-[11px] text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    value={startHour}
                    onChange={(event) => setStartHour(event.target.value)}
                  >
                    <option value="">Sleep Start Time</option>
                    {hourOptions.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </td>
                {Array.from({ length: 8 }, (_, index) => (
                  <td
                    key={`time-row-${index}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center"
                    style={index < 7 ? { backgroundColor: '#d9d9d9', color: '#000', fontWeight: 700 } : undefined}
                  >
                    {index < 7 ? 'Sleep' : ''}
                  </td>
                ))}
              </tr>
              {hourRows.map((hourValue) => (
                <tr key={`hour-row-${hourValue}`} className="grid grid-cols-9">
                  <td className="border border-[#e5e7eb] px-3 py-2 font-semibold">
                    {formatHour12(hourValue)}
                  </td>
                  {Array.from({ length: 8 }, (_, index) => (
                    <td key={`hour-${hourValue}-${index}`} className="border border-[#e5e7eb] px-3 py-2"></td>
                  ))}
                </tr>
              ))}
              <tr className="grid grid-cols-9">
                <td className="border border-[#e5e7eb] px-3 py-2">
                  <select
                    className="w-full rounded border border-[#ced3d0] bg-white px-2 py-1 text-[11px] text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    value={startMinute}
                    onChange={(event) => setStartMinute(event.target.value)}
                    disabled={!startHour}
                  >
                    <option value="">{startHour ? `${startHour}` : 'Sleep End Time'}</option>
                    {minuteOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </td>
                {Array.from({ length: 8 }, (_, index) => (
                  <td
                    key={`minute-row-${index}`}
                    className="border border-[#e5e7eb] px-3 py-2"
                    style={index < 7 ? { backgroundColor: '#d9d9d9' } : undefined}
                  ></td>
                ))}
              </tr>
              {trailingMinuteRows.map((minutesValue, rowIdx) => (
                <tr key={`trailing-row-${rowIdx}`} className="grid grid-cols-9">
                  <td className="border border-[#e5e7eb] px-3 py-2 font-semibold">
                    {formatHour12(
                      Math.floor(minutesValue / 60),
                      (minutesValue % 60).toString().padStart(2, '0')
                    )}
                  </td>
                  {Array.from({ length: 8 }, (_, index) => (
                    <td key={`trailing-${rowIdx}-${index}`} className="border border-[#e5e7eb] px-3 py-2"></td>
                  ))}
                </tr>
              ))}
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-2 text-[11px]"
                  style={{ height: '14px', backgroundColor: '#000' }}
                ></td>
              </tr>
              <tr className="grid grid-cols-9 text-sm">
                <td className="border border-[#e5e7eb]" style={{ backgroundColor: '#000' }}></td>
                {displayedWeekDays.map((day, idx) => (
                  <td
                    key={`week-summary-${day}-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                  >
                    {day}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] text-center"
                  style={{ backgroundColor: '#000', color: '#fff', fontWeight: 700 }}
                >
                  Total
                </td>
              </tr>
              <tr className="grid grid-cols-9 text-sm">
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center"
                  style={{ backgroundColor: '#d9d9d9', color: '#000', fontWeight: 700 }}
                >
                  Sleep
                </td>
                {placeholderSleepValues.map((value, idx) => (
                  <td
                    key={`sleep-row-${idx}`}
                    className="border border-[#e5e7eb] px-3 py-2 text-center"
                    style={{ backgroundColor: '#efefef' }}
                  >
                    {value.toFixed(2)}
                  </td>
                ))}
                <td
                  className="border border-[#e5e7eb] px-3 py-2 text-center font-semibold"
                  style={{ backgroundColor: '#efefef' }}
                >
                  {placeholderSleepTotal.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ListicalMenu({ incrementMinutes, onIncrementChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded border border-[#ced3d0] bg-white px-3 py-2 font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6] hover:shadow-md"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>Listical</span>
      </button>
      {open ? (
        <div
          className="absolute right-0 mt-3 w-80 rounded-lg border border-[#94a3b8] p-4 shadow-2xl z-50"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.97)' }}
        >
          <div className="flex items-center" style={{ gap: '10px' }}>
            <label
              className="text-xs font-semibold text-slate-700 whitespace-nowrap"
              htmlFor="increment-select"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.97)' }}
            >
              Increment
            </label>
            <select
              id="increment-select"
              className="flex-1 rounded border border-[#ced3d0] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              value={incrementMinutes}
              onChange={(event) => onIncrementChange(parseInt(event.target.value, 10) || 15)}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
