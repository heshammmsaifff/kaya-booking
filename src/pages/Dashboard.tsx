import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import Swal from "sweetalert2";
import {
  LogOut,
  Clock,
  Users,
  CheckCircle,
  Hourglass,
  Settings,
  Image,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  duration_minutes: number | null;
  service_started_at?: string | null;
  service_ended_at?: string | null;
  notes: string | null;
  created_at: string;
};

const statusLabels: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  waiting: {
    label: "في الانتظار",
    color: "bg-yellow-500/20 text-yellow-400",
    icon: Hourglass,
  },
  serving: {
    label: "يتم الخدمة",
    color: "bg-primary/20 text-primary",
    icon: Users,
  },
  completed: {
    label: "مكتمل",
    color: "bg-green-500/20 text-green-400",
    icon: CheckCircle,
  },
  cancelled: {
    label: "ملغي",
    color: "bg-destructive/20 text-destructive",
    icon: Clock,
  },
};

const tableTypeLabels: Record<string, string> = {
  indoor: "داخلي",
  outdoor: "خارجي",
  vip: "VIP",
  private: "خاص",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleReservation, setScheduleReservation] =
    useState<Reservation | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleHour, setScheduleHour] = useState<string>("");
  const [scheduleMinute, setScheduleMinute] = useState<string>("");
  const [schedulePeriod, setSchedulePeriod] = useState<"AM" | "PM" | "">("");

  const fetchReservations = useCallback(async () => {
    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .order("reservation_date", { ascending: true })
      .order("reservation_time", { ascending: true });
    if (!error) setReservations((data as any) || []);
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from("site_settings").select("*");
    if (data) {
      const buffer = data.find((s: any) => s.key === "buffer_duration");
      if (buffer) setBufferMinutes((buffer.value as any)?.minutes || 15);
      const images = data.find((s: any) => s.key === "hero_images");
      if (images) setHeroImages((images.value as any) || []);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      if (!roles || roles.length === 0) {
        toast.error("ليس لديك صلاحية الوصول");
        navigate("/");
        return;
      }

      setUserRole(roles[0].role);
      await Promise.all([fetchReservations(), fetchSettings()]);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
    });

    init();
    return () => subscription.unsubscribe();
  }, [navigate, fetchReservations, fetchSettings]);

  // Timer for live service duration
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const confirmAction = async (options: {
    title: string;
    text: string;
    confirmButtonText: string;
  }) => {
    const result = await Swal.fire({
      title: options.title,
      text: options.text,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText,
      cancelButtonText: "إلغاء",
      confirmButtonColor: "hsl(200, 46%, 39%)",
      cancelButtonColor: "#6c757d",
      reverseButtons: true,
    });
    return result.isConfirmed;
  };

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel("reservations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservations" },
        () => {
          fetchReservations();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReservations]);

  const updateStatus = async (reservation: Reservation, status: string) => {
    // حالة خاصة: حجز في الانتظار بدون موعد، نحدد الموعد تلقائيًا بلحظة بدء الخدمة
    if (
      status === "serving" &&
      reservation.status === "waiting" &&
      (!reservation.reservation_time ||
        reservation.reservation_time.slice(0, 5) === "00:00")
    ) {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10); // yyyy-MM-dd
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const timeStr = `${hh}:${mm}:00`;

      const result = await Swal.fire({
        title: "تأكيد بدء الخدمة",
        html: `
          <div style="text-align: right; direction: rtl; font-family: 'Tajawal', sans-serif;">
            <p style="margin-bottom: 8px;"><strong>العميل:</strong> ${reservation.customer_name}</p>
            <p style="margin-bottom: 8px;"><strong>التاريخ:</strong> ${dateStr}</p>
            <p style="margin-bottom: 8px;"><strong>الوقت:</strong> ${hh}:${mm}</p>
            <p style="margin-top: 8px; font-size: 12px; color: #6c757d;">
              سيتم حفظ هذا التاريخ والوقت كتاريخ ووقت الحجز.
            </p>
          </div>
        `,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "بدء الخدمة بهذا الموعد",
        cancelButtonText: "إلغاء",
        confirmButtonColor: "hsl(200, 46%, 39%)",
        cancelButtonColor: "#6c757d",
        reverseButtons: true,
      });

      if (!result.isConfirmed) return;

      const updates: any = {
        status: "serving",
        reservation_date: dateStr,
        reservation_time: timeStr,
      };

      if (!reservation.service_started_at) {
        updates.service_started_at = now.toISOString();
      }

      const { error } = await supabase
        .from("reservations")
        .update(updates)
        .eq("id", reservation.id);

      if (error) {
        toast.error("حدث خطأ");
      } else {
        toast.success("تم بدء الخدمة وتحديث الموعد");
        fetchReservations();
      }
      return;
    }

    let title = "تأكيد الإجراء";
    let text = "هل أنت متأكد من تنفيذ هذا الإجراء؟";
    let confirmButtonText = "تأكيد";

    if (status === "serving") {
      title = "بدء الخدمة";
      text = "هل تريد بدء الخدمة لهذا الحجز؟";
      confirmButtonText = "بدء الخدمة";
    } else if (status === "completed") {
      title = "إنهاء الخدمة";
      text = "هل تريد إنهاء الخدمة وتسجيل المدة؟";
      confirmButtonText = "إنهاء الخدمة";
    } else if (status === "cancelled") {
      title = "إلغاء الحجز";
      text = "هل تريد إلغاء هذا الحجز؟";
      confirmButtonText = "إلغاء الحجز";
    }

    const confirmed = await confirmAction({ title, text, confirmButtonText });
    if (!confirmed) return;

    const updates: any = { status };

    // Start service: record start time
    if (status === "serving" && !reservation.service_started_at) {
      updates.service_started_at = new Date().toISOString();
    }

    // Complete service: record end time and total duration in minutes
    if (status === "completed" && reservation.service_started_at) {
      const start = new Date(reservation.service_started_at);
      const end = new Date();
      const diffMs = end.getTime() - start.getTime();
      const minutes = Math.max(0, Math.round(diffMs / 60000));
      updates.service_ended_at = end.toISOString();
      updates.duration_minutes = minutes;
    }

    const { error } = await supabase
      .from("reservations")
      .update(updates)
      .eq("id", reservation.id);
    if (error) {
      toast.error("حدث خطأ");
    } else {
      toast.success("تم تحديث الحالة");
      fetchReservations();
    }
  };

  // duration & departure time لم تعد مستخدمة

  const setReservationSchedule = async (
    id: string,
    date: Date,
    time: string,
  ) => {
    const dateStr = date.toISOString().slice(0, 10); // yyyy-MM-dd

    const { error } = await supabase
      .from("reservations")
      .update({
        reservation_date: dateStr,
        reservation_time: `${time}:00`,
      } as any)
      .eq("id", id);

    if (!error) {
      toast.success("تم تحديد موعد الحجز");
      fetchReservations();
    } else {
      toast.error("حدث خطأ أثناء تحديد الموعد");
    }
  };

  const handleReservationScheduleConfirm = async () => {
    if (
      !scheduleReservation ||
      !scheduleDate ||
      !scheduleHour ||
      !scheduleMinute ||
      !schedulePeriod
    ) {
      toast.error("يرجى اختيار التاريخ والوقت أولاً");
      return;
    }

    const hourNum = parseInt(scheduleHour, 10);
    const minuteNum = parseInt(scheduleMinute, 10);

    let hour24 = hourNum % 12;
    if (schedulePeriod === "PM") {
      hour24 += 12;
    }

    const hh = hour24.toString().padStart(2, "0");
    const mm = minuteNum.toString().padStart(2, "0");
    const time24 = `${hh}:${mm}`;

    await setReservationSchedule(scheduleReservation.id, scheduleDate, time24);

    // إغلاق الـ Dialog وتصفير الحقول بعد النجاح
    setScheduleDialogOpen(false);
    setScheduleReservation(null);
    setScheduleDate(undefined);
    setScheduleHour("");
    setScheduleMinute("");
    setSchedulePeriod("");
  };

  const updateBufferDuration = async () => {
    const { error } = await supabase
      .from("site_settings")
      .update({ value: { minutes: bufferMinutes } } as any)
      .eq("key", "buffer_duration");
    if (!error) toast.success("تم التحديث");
    else toast.error("حدث خطأ");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fileName = `hero-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("hero-images")
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("hero-images")
        .getPublicUrl(fileName);

      const updatedImages = [...heroImages, urlData.publicUrl];
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: "hero_images", value: updatedImages } as any, {
          onConflict: "key",
        });
      if (error) throw error;

      setHeroImages(updatedImages);
      toast.success("تم رفع الصورة");
    } catch {
      toast.error("حدث خطأ أثناء الرفع");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeHeroImage = async (url: string) => {
    const updatedImages = heroImages.filter((i) => i !== url);
    const { error } = await supabase
      .from("site_settings")
      .update({ value: updatedImages } as any)
      .eq("key", "hero_images");
    if (!error) {
      setHeroImages(updatedImages);
      toast.success("تم حذف الصورة");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const filtered =
    filterStatus === "all"
      ? reservations
      : reservations.filter((r) => r.status === filterStatus);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAdmin = userRole === "admin";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="glass border-b border-border/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-xl font-bold gradient-text">
              KAYA
            </h1>
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded-full">
              {isAdmin ? "مدير" : "كاشير"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground"
          >
            <LogOut className="h-4 w-4 ml-1" />
            خروج
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="reservations" dir="rtl">
          <TabsList className="bg-muted/50 rounded-xl mb-6">
            <TabsTrigger
              value="reservations"
              className="rounded-lg font-heading"
            >
              الحجوزات
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="rounded-lg font-heading">
                الإعدادات
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="reservations">
            {/* Filters */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {["all", "waiting", "serving", "completed", "cancelled"].map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-heading transition-all",
                      filterStatus === s
                        ? "gradient-primary font-bold"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "all" ? "الكل" : statusLabels[s]?.label}
                    {s !== "all" && (
                      <span className="mr-1 text-xs">
                        ({reservations.filter((r) => r.status === s).length})
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {Object.entries(statusLabels).map(([key, val]) => {
                const count = reservations.filter(
                  (r) => r.status === key,
                ).length;
                const Icon = val.icon;
                return (
                  <div key={key} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {val.label}
                      </span>
                    </div>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                );
              })}
            </div>

            {/* Reservations List */}
            <div className="space-y-3">
              {filtered.length === 0 && (
                <p className="text-center text-muted-foreground py-12">
                  لا توجد حجوزات
                </p>
              )}
              {filtered.map((r) => {
                const status = statusLabels[r.status] || statusLabels.waiting;

                let liveDuration: string | null = null;
                if (r.status === "serving" && r.service_started_at) {
                  const start = new Date(r.service_started_at);
                  const diffMs = now.getTime() - start.getTime();
                  if (diffMs > 0) {
                    const totalSeconds = Math.floor(diffMs / 1000);
                    const hours = Math.floor(totalSeconds / 3600);
                    const minutes = Math.floor((totalSeconds % 3600) / 60);
                    const seconds = totalSeconds % 60;
                    const mm = minutes.toString().padStart(2, "0");
                    const ss = seconds.toString().padStart(2, "0");
                    if (hours > 0) {
                      const hh = hours.toString().padStart(2, "0");
                      liveDuration = `${hh}:${mm}:${ss}`;
                    } else {
                      liveDuration = `${mm}:${ss}`;
                    }
                  }
                }

                let finalDuration: string | null = null;
                if (r.status === "completed" && r.duration_minutes != null) {
                  const totalMinutes = r.duration_minutes;
                  const hours = Math.floor(totalMinutes / 60);
                  const minutes = totalMinutes % 60;
                  const mm = minutes.toString().padStart(2, "0");
                  if (hours > 0) {
                    const hh = hours.toString().padStart(2, "0");
                    finalDuration = `${hh}:${mm}`;
                  } else {
                    finalDuration = `${mm} دقيقة`;
                  }
                }

                return (
                  <div key={r.id} className="glass rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-heading font-bold text-lg">
                          {r.customer_name}
                        </h3>
                        <p className="text-sm text-muted-foreground" dir="ltr">
                          {r.phone}
                        </p>
                      </div>
                      <div className="text-left">
                        <span
                          className={cn(
                            "text-xs px-3 py-1 rounded-full font-medium",
                            status.color,
                          )}
                        >
                          {status.label}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                          #{r.reservation_code}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                      {(() => {
                        const isScheduled =
                          r.reservation_time?.slice(0, 5) !== "00:00";
                        return (
                          <>
                            <div>
                              <span className="text-muted-foreground text-xs">
                                حالة الموعد
                              </span>
                              <p className="font-medium">
                                {isScheduled
                                  ? "تم تأكيد الموعد"
                                  : "لم يتم تحديد الموعد بعد"}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">
                                التاريخ
                              </span>
                              <p className="font-medium">
                                {isScheduled ? r.reservation_date : "—"}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">
                                الوقت
                              </span>
                              <p className="font-medium">
                                {isScheduled
                                  ? r.reservation_time?.slice(0, 5)
                                  : "—"}
                              </p>
                            </div>
                          </>
                        );
                      })()}
                      <div>
                        <span className="text-muted-foreground text-xs">
                          عدد
                        </span>
                        <p className="font-medium">{r.party_size} أشخاص</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          الطاولة
                        </span>
                        <p className="font-medium">
                          {tableTypeLabels[r.table_type] || r.table_type}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          مدة الخدمة
                        </span>
                        <p className="font-medium">
                          {r.status === "serving" && liveDuration
                            ? liveDuration
                            : r.status === "completed" && finalDuration
                              ? finalDuration
                              : "—"}
                        </p>
                      </div>
                    </div>

                    {/* لم يعد هناك تحديد/تعديل يدوي للموعد من شاشة الانتظار
                        يتم الآن تحديد التاريخ والوقت تلقائيًا عند نقل الحجز إلى الخدمة */}

                    {(r.status === "waiting" || r.status === "serving") && (
                      <div className="border-t border-border/50 pt-3">
                        <div className="flex gap-2">
                          {r.status === "waiting" && (
                            <Button
                              size="sm"
                              className="gradient-primary rounded-lg font-heading"
                              onClick={() => updateStatus(r, "serving")}
                            >
                              نقل إلى الخدمة
                            </Button>
                          )}
                          {r.status === "serving" && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 rounded-lg font-heading"
                              onClick={() => updateStatus(r, "completed")}
                            >
                              <CheckCircle className="h-3 w-3 ml-1" />
                              مكتمل
                            </Button>
                          )}
                          {r.status === "waiting" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg font-heading text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => updateStatus(r, "cancelled")}
                            >
                              إلغاء
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="settings" className="space-y-8">
              {/* Buffer Duration */}
              <div className="glass rounded-2xl p-6">
                <h3 className="font-heading text-lg font-bold mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  مدة التجهيز (Buffering)
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  المدة الزمنية بعد مغادرة العميل لتجهيز الطاولة
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={bufferMinutes}
                    onChange={(e) =>
                      setBufferMinutes(parseInt(e.target.value) || 0)
                    }
                    className="w-24 bg-muted/50 rounded-xl"
                    dir="ltr"
                  />
                  <span className="text-sm text-muted-foreground">دقيقة</span>
                  <Button
                    onClick={updateBufferDuration}
                    className="gradient-primary rounded-xl font-heading"
                  >
                    حفظ
                  </Button>
                </div>
              </div>

              {/* Hero Images */}
              <div className="glass rounded-2xl p-6">
                <h3 className="font-heading text-lg font-bold mb-4 flex items-center gap-2">
                  <Image className="h-5 w-5 text-primary" />
                  صور الواجهة الرئيسية
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {heroImages.map((url, i) => (
                    <div
                      key={i}
                      className="relative group rounded-xl overflow-hidden aspect-video"
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeHeroImage(url)}
                        className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <label className="cursor-pointer">
                  <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                    <Image className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {uploadingImage ? "جاري الرفع..." : "اضغط لرفع صورة"}
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                  />
                </label>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Schedule dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent
          dir="rtl"
          className="w-[96%] sm:w-[90%] max-w-lg max-h-[90vh] sm:max-h-[80vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>تحديد موعد الحجز</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {scheduleReservation && (
              <div className="text-sm text-muted-foreground">
                <p className="font-heading font-medium">
                  {scheduleReservation.customer_name}
                </p>
                <p dir="ltr" className="text-xs">
                  {scheduleReservation.phone}
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div className="w-full">
                <Label className="mb-2 block text-xs text-muted-foreground">
                  تاريخ الحجز
                </Label>
                <div className="rounded-xl border border-border/50 p-2 bg-muted/30 max-h-[320px] overflow-y-auto">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={setScheduleDate}
                    disabled={(d) => d < new Date(new Date().toDateString())}
                    className="pointer-events-auto"
                  />
                </div>
              </div>

              <div className="w-full">
                <Label className="mb-2 block text-xs text-muted-foreground">
                  وقت الحجز
                </Label>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select
                      value={scheduleHour}
                      onValueChange={setScheduleHour}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="الساعة" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (h) => (
                            <SelectItem key={h} value={String(h)}>
                              {h}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    <Select
                      value={scheduleMinute}
                      onValueChange={setScheduleMinute}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="الدقيقة" />
                      </SelectTrigger>
                      <SelectContent>
                        {["00", "15", "30", "45"].map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={schedulePeriod}
                      onValueChange={(v: "AM" | "PM") => setSchedulePeriod(v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="AM / PM" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    سيتم حفظ الوقت بصيغة 24 ساعة تلقائيًا.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setScheduleDialogOpen(false);
                setScheduleReservation(null);
                setScheduleDate(undefined);
                setScheduleHour("");
                setScheduleMinute("");
                setSchedulePeriod("");
              }}
            >
              إلغاء
            </Button>
            <Button
              className="gradient-primary font-heading"
              onClick={handleReservationScheduleConfirm}
              disabled={
                !scheduleDate ||
                !scheduleHour ||
                !scheduleMinute ||
                !schedulePeriod
              }
            >
              حفظ الموعد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
