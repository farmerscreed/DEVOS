import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
    available: { label: 'Available', bg: 'bg-emerald-950/40', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
    reserved: { label: 'Reserved', bg: 'bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-400' },
    sold: { label: 'Sold', bg: 'bg-red-950/40', text: 'text-red-300', border: 'border-red-500/30', dot: 'bg-red-400' },
    held: { label: 'Held', bg: 'bg-zinc-800/60', text: 'text-zinc-400', border: 'border-zinc-600/30', dot: 'bg-zinc-500' },
};

interface Unit {
    id: string;
    unit_number: string;
    unit_type: string;
    floor: number;
    price_kobo: number;
    size_sqm: number | null;
    status: 'available' | 'reserved' | 'sold' | 'held';
    buyer_id: string | null;
    project_id: string;
}

interface UnitInventoryProps {
    onReserveUnit?: (unitId: string) => void;
    reservingForLeadId?: string | null;
}

export function UnitInventory({ onReserveUnit, reservingForLeadId }: UnitInventoryProps) {
    const { organisation: currentOrg } = useAppStore();
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    const fetchUnits = useCallback(async () => {
        if (!currentOrg) return;
        const { data, error } = await supabase
            .from('units')
            .select('*')
            .eq('organisation_id', currentOrg.id)
            .order('floor', { ascending: true })
            .order('unit_number', { ascending: true });

        if (!error && data) {
            setUnits(data as Unit[]);
            setLastUpdated(new Date());
        }
        setLoading(false);
    }, [currentOrg]);

    useEffect(() => {
        fetchUnits();
    }, [fetchUnits]);

    // Supabase Realtime subscription
    useEffect(() => {
        if (!currentOrg) return;

        const channel = supabase
            .channel('units_realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'units',
                filter: `organisation_id=eq.${currentOrg.id}`,
            }, (payload: { new: Partial<Unit>; old: Partial<Unit>; eventType: string }) => {
                setUnits(prev => {
                    const updated = payload.new as Unit;
                    const idx = prev.findIndex(u => u.id === updated.id);
                    if (idx === -1) return [...prev, updated];
                    const next = [...prev];
                    next[idx] = updated;
                    return next;
                });
                setLastUpdated(new Date());
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [currentOrg]);

    const filteredUnits = filter === 'all' ? units : units.filter(u => u.status === filter);

    // Aggregate counts
    const counts = units.reduce((acc, u) => {
        acc[u.status] = (acc[u.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Unit Inventory</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                        Real-time status · Last updated {lastUpdated.toLocaleTimeString()}
                    </p>
                </div>

                {reservingForLeadId && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        Select an available unit to reserve
                    </div>
                )}
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-4 gap-3">
                {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
                    <button
                        key={status}
                        onClick={() => setFilter(filter === status ? 'all' : status)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all
              ${cfg.bg} ${cfg.border}
              ${filter === status ? 'ring-1 ring-white/20 scale-[1.02]' : 'opacity-80 hover:opacity-100'}`}
                    >
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                        <div className="text-left">
                            <p className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</p>
                            <p className="text-lg font-bold text-white">{counts[status] || 0}</p>
                        </div>
                    </button>
                ))}
            </div>

            {/* Unit grid */}
            {filteredUnits.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                    <p className="text-4xl mb-3">🏗️</p>
                    <p className="font-medium text-zinc-300">No units found</p>
                    <p className="text-sm mt-1">Add units in the project settings to get started.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                    {filteredUnits.map(unit => {
                        const cfg = STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                        const isClickable = unit.status === 'available' && !!reservingForLeadId;

                        return (
                            <button
                                key={unit.id}
                                disabled={!isClickable && !!reservingForLeadId}
                                onClick={() => isClickable && onReserveUnit?.(unit.id)}
                                title={isClickable ? `Reserve Unit ${unit.unit_number}` : undefined}
                                className={`
                  relative p-3 rounded-xl border text-left transition-all duration-200
                  ${cfg.bg} ${cfg.border}
                  ${isClickable ? 'hover:ring-2 hover:ring-blue-400 hover:scale-105 cursor-pointer' : 'cursor-default'}
                  ${!isClickable && !!reservingForLeadId && unit.status !== 'available' ? 'opacity-40' : ''}
                `}
                            >
                                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium mb-2 ${cfg.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                    {cfg.label}
                                </div>
                                <p className="font-bold text-white text-sm">#{unit.unit_number}</p>
                                <p className="text-xs text-zinc-400 capitalize">{unit.unit_type}</p>
                                {unit.floor != null && (
                                    <p className="text-xs text-zinc-500">Floor {unit.floor}</p>
                                )}
                                {unit.price_kobo > 0 && (
                                    <p className="text-xs font-medium text-zinc-300 mt-1">
                                        ₦{(unit.price_kobo / 100).toLocaleString('en-NG', { notation: 'compact', maximumFractionDigits: 1 })}
                                    </p>
                                )}
                                {isClickable && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-blue-500/10 opacity-0 hover:opacity-100 transition-opacity">
                                        <span className="text-xs font-semibold text-blue-300 bg-blue-900/80 px-2 py-1 rounded">Reserve</span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
