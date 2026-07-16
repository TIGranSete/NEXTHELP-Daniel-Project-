import React, { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react";

interface WindowsDatePickerProps {
  value: string | undefined;
  onChange: (date: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  headerText?: string;
  align?: "left" | "right";
}

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

const WEEKDAYS_PT_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

const DAYS_OF_WEEK_FULL_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado"
];

export default function WindowsDatePicker({ 
  value, 
  onChange, 
  disabled = false,
  placeholder = "Escolha uma data limite...",
  headerText = "Data do Projeto",
  align = "left"
}: WindowsDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial date value or default to current date
  const getInitialYearAndMonth = () => {
    if (value) {
      const parts = value.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1; // 0-indexed
        if (!isNaN(y) && !isNaN(m)) {
          return { year: y, month: m };
        }
      }
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  };

  const [currentYear, setCurrentYear] = useState(() => getInitialYearAndMonth().year);
  const [currentMonth, setCurrentMonth] = useState(() => getInitialYearAndMonth().month);

  // Sync year and month when value props changes
  useEffect(() => {
    const { year, month } = getInitialYearAndMonth();
    setCurrentYear(year);
    setCurrentMonth(month);
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setViewMode('days');
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Format date to show to the user (e.g. DD/MM/YYYY)
  const getFormattedDisplayDate = () => {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return value;
  };

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Navigate based on viewMode
  const handlePrev = () => {
    if (viewMode === 'days') {
      handlePrevMonth();
    } else if (viewMode === 'months') {
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentYear(prev => prev - 12);
    }
  };

  const handleNext = () => {
    if (viewMode === 'days') {
      handleNextMonth();
    } else if (viewMode === 'months') {
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentYear(prev => prev + 12);
    }
  };

  // Generate calendar cells (6 weeks grid = 42 cells)
  const generateCalendarDays = () => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();

    const cells = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const m = currentMonth === 0 ? 11 : currentMonth - 1;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      cells.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateString: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      cells.push({
        day: i,
        month: currentMonth,
        year: currentYear,
        isCurrentMonth: true,
        dateString: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`
      });
    }

    // Next month padding
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const m = currentMonth === 11 ? 0 : currentMonth + 1;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      cells.push({
        day: i,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateString: `${y}-${String(m + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`
      });
    }

    return cells;
  };

  const days = generateCalendarDays();

  // Handle day click
  const handleSelectDay = (dateString: string) => {
    if (disabled) return;
    onChange(dateString);
    setIsOpen(false);
  };

  const handleClear = () => {
    if (disabled) return;
    onChange(undefined);
    setIsOpen(false);
  };

  // Check if a day is today
  const isToday = (dateString: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return dateString === todayStr;
  };

  // Get dynamic header for Windows Style (e.g., "quarta-feira, 1 de julho" using current state or selected value)
  const getWindowsHeaderDateText = () => {
    let dateObj = new Date();
    if (value) {
      const parts = value.split("-");
      if (parts.length === 3) {
        dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    }
    const dayOfWeek = DAYS_OF_WEEK_FULL_PT[dateObj.getDay()];
    const dayOfMonth = dateObj.getDate();
    const monthName = MONTHS_PT[dateObj.getMonth()];
    return `${dayOfWeek}, ${dayOfMonth} de ${monthName}`;
  };

  return (
    <div className="relative w-full" ref={containerRef} id="windows-date-picker-root">
      {/* Selector input styled beautifully */}
      <div className="relative flex items-center">
        <input
          type="text"
          readOnly
          disabled={disabled}
          value={getFormattedDisplayDate()}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          placeholder={placeholder}
          className="w-full bg-black border border-neutral-900 rounded-lg py-2 pl-10 pr-10 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 cursor-pointer select-none transition-all hover:bg-neutral-950"
        />
        
        {/* Calendar Icon Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="absolute left-3 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer flex items-center justify-center"
          title="Abrir calendário"
        >
          <CalendarIcon className="h-4 w-4" />
        </button>

        {/* Clear Button */}
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer p-0.5"
            title="Limpar data"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Windows 11 Fluent-style Calendar Popover */}
      {isOpen && (
        <div 
          className={`absolute z-50 ${align === "left" ? "left-0" : "right-0"} mt-2 bg-neutral-950 border border-neutral-900 shadow-2xl rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 p-4`}
          style={{ width: "320px", maxWidth: "100vw" }}
        >
          {/* Windows Header Info Panel */}
          <div className="pb-3 mb-3 border-b border-neutral-900 flex justify-between items-start">
            <div>
              <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold block mb-1">
                {headerText}
              </span>
              <span className="text-sm font-semibold text-white capitalize">
                {getWindowsHeaderDateText()}
              </span>
            </div>
            {/* Quick go to today button */}
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                handleSelectDay(todayStr);
              }}
              className="text-[10px] bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 px-2 py-1 rounded hover:bg-emerald-900/60 transition-all font-semibold flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3" /> Hoje
            </button>
          </div>

          {/* Month/Year Navigation Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1 select-none pl-1">
              {viewMode === 'days' && (
                <>
                  <button
                    type="button"
                    onClick={() => setViewMode('months')}
                    className="text-xs font-bold text-slate-200 hover:text-emerald-400 capitalize hover:bg-neutral-900 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                    title="Escolher mês"
                  >
                    {MONTHS_PT[currentMonth]}
                  </button>
                  <span className="text-xs font-bold text-slate-600">de</span>
                  <button
                    type="button"
                    onClick={() => setViewMode('years')}
                    className="text-xs font-bold text-slate-200 hover:text-emerald-400 hover:bg-neutral-900 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                    title="Escolher ano"
                  >
                    {currentYear}
                  </button>
                </>
              )}
              {viewMode === 'months' && (
                <button
                  type="button"
                  onClick={() => setViewMode('years')}
                  className="text-xs font-bold text-slate-200 hover:text-emerald-400 hover:bg-neutral-900 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                  title="Escolher ano"
                >
                  {currentYear}
                </button>
              )}
              {viewMode === 'years' && (
                <span className="text-xs font-bold text-slate-200 px-1.5 py-0.5 select-none">
                  {currentYear - 5} - {currentYear + 6}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handlePrev}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-neutral-900 transition-all cursor-pointer"
                title="Voltar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-neutral-900 transition-all cursor-pointer"
                title="Avançar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body based on viewMode */}
          {viewMode === 'days' && (
            <>
              {/* Weekday headers row (e.g. D, S, T, Q, Q, S, S) */}
              <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                {WEEKDAYS_PT_SHORT.map((day, idx) => (
                  <span key={idx} className="text-[10px] font-bold text-slate-500 select-none">
                    {day}
                  </span>
                ))}
              </div>

              {/* 6-week Days grid */}
              <div className="grid grid-cols-7 gap-1 text-center animate-in fade-in zoom-in-95 duration-100">
                {days.map((cell, idx) => {
                  const isSelected = value === cell.dateString;
                  const isCurrentActualDay = isToday(cell.dateString);
                  
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectDay(cell.dateString)}
                      className={`
                        h-8 w-8 text-xs font-medium rounded-full flex items-center justify-center transition-all relative cursor-pointer
                        ${cell.isCurrentMonth ? "text-slate-200" : "text-slate-600"}
                        ${isSelected 
                          ? "bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:bg-emerald-400" 
                          : isCurrentActualDay
                            ? "border border-emerald-500/80 text-emerald-400 hover:bg-emerald-950/40"
                            : "hover:bg-neutral-900 hover:text-white"
                        }
                      `}
                    >
                      {cell.day}
                      
                      {/* Subtle small dot under today's date if not selected */}
                      {isCurrentActualDay && !isSelected && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 bg-emerald-500 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {viewMode === 'months' && (
            <div className="grid grid-cols-3 gap-2 py-2 animate-in fade-in zoom-in-95 duration-100">
              {MONTHS_PT.map((m, idx) => {
                const isSelected = currentMonth === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCurrentMonth(idx);
                      setViewMode('days');
                    }}
                    className={`
                      py-2.5 px-1 text-xs font-medium capitalize rounded-lg transition-all cursor-pointer
                      ${isSelected
                        ? "bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                        : "text-slate-300 hover:bg-neutral-900 hover:text-white"
                      }
                    `}
                  >
                    {m.substring(0, 3)}
                  </button>
                );
              })}
            </div>
          )}

          {viewMode === 'years' && (
            <div className="grid grid-cols-3 gap-2 py-2 animate-in fade-in zoom-in-95 duration-100">
              {Array.from({ length: 12 }, (_, i) => currentYear - 5 + i).map((yr) => {
                const isSelected = currentYear === yr;
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      setCurrentYear(yr);
                      setViewMode('months');
                    }}
                    className={`
                      py-2.5 px-1 text-xs font-medium rounded-lg transition-all cursor-pointer
                      ${isSelected
                        ? "bg-emerald-500 text-black font-bold shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                        : "text-slate-300 hover:bg-neutral-900 hover:text-white"
                      }
                    `}
                  >
                    {yr}
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer action */}
          <div className="mt-3 pt-2.5 border-t border-neutral-900 flex justify-between items-center text-[10px]">
            <span className="text-slate-600">
              {value ? "Prazo definido" : "Nenhum prazo selecionado"}
            </span>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-rose-400 hover:text-rose-300 font-bold hover:underline transition-all cursor-pointer"
              >
                Remover Prazo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
