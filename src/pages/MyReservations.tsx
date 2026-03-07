import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Search, X, Clock, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const timeSlots = [
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00",
];

type Reservation = {
  id: string;
  customer_name: string;
  phone: string;
  party_size: number;
  table_type: string;
  reservation_date: string;
  reservation_time: string;
  status: string;
  reservation_code: string;
  created_at: string;
};

const statusLabels: Record<string, { label: string; color: string }> = {
  waiting: { label: "في الانتظار", color: "bg-yellow-500/20 text-yellow-400" },
  serving: { label: "يتم الخدمة", color: "bg-primary/20 text-primary" },
  completed: { label: "مكتمل", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "ملغي", color: "bg-destructive/20 text-destructive" },
};

const tableTypeLabels: Record<string, string> = {
  indoor: "داخلي",
  outdoor: "خارجي",
  vip: "VIP",
  private: "خاص",
};

const MyReservations = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<Date>();
  const [newTime, setNewTime] = useState("");

  const handleSearch = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("phone", phone)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReservations((data as any) || []);
      setSearched(true);
    } catch {
      toast.error("حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "cancelled" } as any)
        .eq("id", id);
      if (error) throw error;
      toast.success("تم إلغاء الحجز");
      handleSearch();
    } catch {
      toast.error("حدث خطأ");
    }
  };

  const handleDelay = async (id: string) => {
    if (!newDate || !newTime) {
      toast.error("يرجى اختيار التاريخ والوقت الجديدين");
      return;
    }
    try {
      const { error } = await supabase
        .from("reservations")
        .update({
          reservation_date: format(newDate, "yyyy-MM-dd"),
          reservation_time: newTime + ":00",
        } as any)
        .eq("id", id);
      if (error) throw error;
      toast.success("تم تأجيل الحجز");
      setEditingId(null);
      setNewDate(undefined);
      setNewTime("");
      handleSearch();
    } catch {
      toast.error("حدث خطأ");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto pt-8">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 font-heading"
        >
          <ArrowRight className="h-4 w-4" />
          الرئيسية
        </button>

        <h1 className="font-heading text-3xl font-bold mb-2">حجوزاتي</h1>
        <p className="text-muted-foreground mb-8">ابحث بواسطة رقم الجوال</p>

        <div className="flex gap-2 mb-8">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05XXXXXXXX"
            dir="ltr"
            className="bg-muted/50 border-border/50 py-5 rounded-xl"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button
            onClick={handleSearch}
            className="gradient-primary px-6 rounded-xl"
            disabled={loading}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {searched && reservations.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            لا توجد حجوزات مرتبطة بهذا الرقم
          </div>
        )}

        <div className="space-y-4">
          {reservations.map((r) => {
            const status = statusLabels[r.status] || statusLabels.waiting;
            const isScheduled = r.reservation_time?.slice(0, 5) !== "00:00";
            return (
              <div key={r.id} className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs px-3 py-1 rounded-full font-medium", status.color)}>
                    {status.label}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    #{r.reservation_code}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">حالة الموعد</span>
                    <p className="font-medium">
                      {isScheduled ? "تم تأكيد الموعد" : "لم يتم تحديد الموعد بعد"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">الاسم</span>
                    <p className="font-medium">{r.customer_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">عدد الأشخاص</span>
                    <p className="font-medium">{r.party_size}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">التاريخ</span>
                    <p className="font-medium">
                      {isScheduled ? r.reservation_date : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">الوقت</span>
                    <p className="font-medium">
                      {isScheduled ? r.reservation_time?.slice(0, 5) : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">نوع الطاولة</span>
                    <p className="font-medium">{tableTypeLabels[r.table_type] || r.table_type}</p>
                  </div>
                </div>

                {(r.status === "waiting") && (
                  <>
                    {editingId === r.id ? (
                      <div className="space-y-3 border-t border-border/50 pt-3">
                        <Label className="text-sm font-heading">التاريخ الجديد</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start rounded-xl bg-muted/50 text-right">
                              <CalendarIcon className="ml-2 h-4 w-4" />
                              {newDate ? format(newDate, "PPP", { locale: ar }) : "اختر التاريخ"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={newDate} onSelect={setNewDate} disabled={(d) => d < new Date()} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                        <Label className="text-sm font-heading">الوقت الجديد</Label>
                        <Select value={newTime} onValueChange={setNewTime}>
                          <SelectTrigger className="rounded-xl bg-muted/50">
                            <SelectValue placeholder="اختر الوقت" />
                          </SelectTrigger>
                          <SelectContent>
                            {timeSlots.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button onClick={() => handleDelay(r.id)} className="flex-1 gradient-primary rounded-xl font-heading">تأكيد</Button>
                          <Button variant="outline" onClick={() => setEditingId(null)} className="rounded-xl">إلغاء</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 border-t border-border/50 pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-lg font-heading"
                          onClick={() => setEditingId(r.id)}
                        >
                          <Clock className="h-3 w-3 ml-1" />
                          تأجيل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-lg font-heading text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => handleCancel(r.id)}
                        >
                          <X className="h-3 w-3 ml-1" />
                          إلغاء
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MyReservations;
