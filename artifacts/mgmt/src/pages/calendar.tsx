import { useState, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  getDay,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, CalendarDays, List, GitCommitHorizontal, Shield, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useListCalendarEvents } from "@workspace/api-client-react";
import type { CalendarEvent } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const EVENT_TYPE_CONFIG: Record<string, { label: string; dot: string; badge: string; icon: React.ElementType }> = {
  milestone: {
    label: "Milestone",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    icon: GitCommitHorizontal,
  },
  compliance: {
    label: "Compliance",
    dot: "bg-orange-500",
    badge: "bg-orange-100 text-orange-800 border-orange-200",
    icon: Shield,
  },
  invoice: {
    label: "Invoice",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-800 border-green-200",
    icon: Receipt,
  },
  overdue: {
    label: "Overdue",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-800 border-red-200",
    icon: CalendarDays,
  },
};

type FilterType = "milestone" | "compliance" | "invoice" | "overdue";

function getBaseType(event: CalendarEvent): string {
  if (event.type === "overdue") {
    if (event.id.startsWith("milestone-")) return "milestone";
    if (event.id.startsWith("compliance-")) return "compliance";
    if (event.id.startsWith("invoice-")) return "invoice";
  }
  return event.type;
}

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"grid" | "agenda">("grid");
  const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(
    new Set(["milestone", "compliance", "invoice", "overdue"]),
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: events = [], isLoading } = useListCalendarEvents(
    { start, end },
    { query: { queryKey: ["calendarEvents", start, end] } },
  );

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (activeFilters.has(e.type as FilterType)) return true;
      return false;
    });
  }, [events, activeFilters]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filteredEvents) {
      const key = e.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDayOfWeek = getDay(days[0]!);

  function toggleFilter(type: FilterType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  const selectedDayEvents = selectedDay
    ? (eventsByDate.get(format(selectedDay, "yyyy-MM-dd")) ?? [])
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">Milestones, compliance deadlines, and invoice due dates</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Month
          </Button>
          <Button
            variant={viewMode === "agenda" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("agenda")}
          >
            <List className="h-4 w-4 mr-1.5" />
            Agenda
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500 font-medium">Filter:</span>
        {(["milestone", "compliance", "invoice", "overdue"] as FilterType[]).map((type) => {
          const cfg = EVENT_TYPE_CONFIG[type]!;
          const active = activeFilters.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                active ? cfg.badge : "bg-slate-100 text-slate-400 border-slate-200 opacity-60",
              )}
            >
              <span className={cn("inline-block w-2 h-2 rounded-full", active ? cfg.dot : "bg-slate-300")} />
              {cfg.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setSelectedDay(null); }}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold text-slate-800">{format(currentMonth, "MMMM yyyy")}</h2>
        <Button variant="outline" size="sm" onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setSelectedDay(null); }}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading events…</div>
      ) : viewMode === "grid" ? (
        <GridView
          days={days}
          firstDayOfWeek={firstDayOfWeek}
          currentMonth={currentMonth}
          eventsByDate={eventsByDate}
          selectedDay={selectedDay}
          onSelectDay={(d) => setSelectedDay(isSameDay(d, selectedDay ?? new Date(0)) ? null : d)}
          selectedDayEvents={selectedDayEvents}
        />
      ) : (
        <AgendaView events={filteredEvents} currentMonth={currentMonth} />
      )}
    </div>
  );
}

function GridView({
  days,
  firstDayOfWeek,
  currentMonth,
  eventsByDate,
  selectedDay,
  onSelectDay,
  selectedDayEvents,
}: {
  days: Date[];
  firstDayOfWeek: number;
  currentMonth: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDay: Date | null;
  onSelectDay: (d: Date) => void;
  selectedDayEvents: CalendarEvent[];
}) {
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-start-${i}`} className="min-h-[90px] border-b border-r border-slate-100 bg-slate-50/50" />
          ))}

          {days.map((day, idx) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(dateKey) ?? [];
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const today = isToday(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const colIdx = (firstDayOfWeek + idx) % 7;
            const isLastCol = colIdx === 6;

            return (
              <button
                key={dateKey}
                onClick={() => onSelectDay(day)}
                className={cn(
                  "min-h-[90px] p-1.5 border-b border-r border-slate-100 text-left transition-colors focus:outline-none",
                  isLastCol && "border-r-0",
                  isSelected
                    ? "bg-blue-50 ring-2 ring-inset ring-blue-400"
                    : "hover:bg-slate-50",
                  !isCurrentMonth && "opacity-40",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    today
                      ? "bg-blue-600 text-white"
                      : "text-slate-700",
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => {
                    const cfg = EVENT_TYPE_CONFIG[e.type] ?? EVENT_TYPE_CONFIG.milestone!;
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "flex items-center gap-1 px-1 py-0.5 rounded text-xs truncate border",
                          cfg.badge,
                        )}
                        title={e.title}
                      >
                        <span className={cn("flex-shrink-0 w-1.5 h-1.5 rounded-full", cfg.dot)} />
                        <span className="truncate">{e.title}</span>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-slate-400 pl-1">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </button>
            );
          })}

          {Array.from({ length: (7 - ((firstDayOfWeek + days.length) % 7)) % 7 }).map((_, i) => (
            <div key={`empty-end-${i}`} className="min-h-[90px] border-b border-r border-slate-100 bg-slate-50/50 last:border-r-0" />
          ))}
        </div>
      </div>

      {selectedDay && (
        <DayDetailPanel day={selectedDay} events={selectedDayEvents} onClose={() => {}} />
      )}
    </div>
  );
}

function DayDetailPanel({ day, events }: { day: Date; events: CalendarEvent[]; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4">
      <h3 className="font-semibold text-slate-900 mb-3">{format(day, "EEEE, MMMM d, yyyy")}</h3>
      {events.length === 0 ? (
        <p className="text-sm text-slate-400">No events on this day.</p>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const cfg = EVENT_TYPE_CONFIG[event.type] ?? EVENT_TYPE_CONFIG.milestone!;
  const Icon = cfg.icon;
  const baseType = getBaseType(event);
  const typeCfg = EVENT_TYPE_CONFIG[baseType] ?? cfg;

  return (
    <Link href={event.linkPath}>
      <a className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 hover:bg-slate-100 transition-colors cursor-pointer group">
        <div className={cn("flex-shrink-0 mt-0.5 p-1.5 rounded-md", typeCfg.badge)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900 group-hover:text-blue-700 truncate">{event.title}</span>
            <Badge variant="outline" className={cn("text-xs border flex-shrink-0", cfg.badge)}>
              {event.type === "overdue" ? "Overdue" : cfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
            {event.projectName && <span>{event.projectName}</span>}
            <span className="capitalize">{event.status}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 mt-0.5" />
      </a>
    </Link>
  );
}

function AgendaView({ events, currentMonth }: { events: CalendarEvent[]; currentMonth: Date }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-12 text-center">
        <CalendarDays className="h-10 w-10 mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500 font-medium">No events in {format(currentMonth, "MMMM yyyy")}</p>
        <p className="text-slate-400 text-sm mt-1">Try adjusting the filters or navigating to another month.</p>
      </div>
    );
  }

  const grouped: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date]!.push(e);
  }

  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
      {sortedDates.map((date) => {
        const dateObj = parseISO(date);
        const dayEvents = grouped[date]!;
        const today = isToday(dateObj);

        return (
          <div key={date}>
            <div className={cn("flex items-center gap-3 px-4 py-2.5 border-b border-slate-100", today ? "bg-blue-50" : "bg-slate-50")}>
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold flex-shrink-0", today ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600")}>
                {format(dateObj, "d")}
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-800">{format(dateObj, "EEEE")}</span>
                <span className="text-xs text-slate-500 ml-2">{format(dateObj, "MMMM d, yyyy")}</span>
              </div>
              <span className="ml-auto text-xs text-slate-400">{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="px-4 py-2 space-y-2">
              {dayEvents.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
