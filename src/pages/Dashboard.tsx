import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, Clock, Users, CheckCircle, Hourglass, Settings, Image, RefreshCw } from "lucide-react";
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
  departure_time: string | null;
  notes: string | null;
  created_at: string;
};

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  waiting: { label: "في الانتظار", color: "bg-yellow-500/20 text-yellow-400", icon: Hourglass },
  serving: { label: "يتم الخدمة", color: "bg-primary/20 text-primary", icon: Users },
  completed: { label: "مكتمل", color: "bg-green-500/20 text-green-400", icon: CheckCircle },
  cancelled: { label: "ملغي", color: "bg-destructive/20 text-destructive", icon: Clock },
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
      const { data: { session } } = await supabase.auth.getSession();
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
    });

    init();
    return () => subscription.unsubscribe();
  }, [navigate, fetchReservations, fetchSettings]);

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel("reservations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => {
        fetchReservations();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReservations]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("reservations")
      .update({ status } as any)
      .eq("id", id);
    if (error) {
      toast.error("حدث خطأ");
    } else {
      toast.success("تم تحديث الحالة");
      fetchReservations();
    }
  };

  const setDuration = async (id: string, minutes: number) => {
    const { error } = await supabase
      .from("reservations")
      .update({ duration_minutes: minutes } as any)
      .eq("id", id);
    if (!error) {
      toast.success("تم تحديد المدة");
      fetchReservations();
    }
  };

  const setDepartureTime = async (id: string, time: string) => {
    const { error } = await supabase
      .from("reservations")
      .update({ departure_time: time } as any)
      .eq("id", id);
    if (!error) {
      toast.success("تم تحديد موعد المغادرة");
      fetchReservations();
    }
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
        .upsert({ key: "hero_images", value: updatedImages } as any, { onConflict: "key" });
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

  const filtered = filterStatus === "all"
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
            <h1 className="font-heading text-xl font-bold gradient-text">KAYA</h1>
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded-full">
              {isAdmin ? "مدير" : "كاشير"}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="h-4 w-4 ml-1" />
            خروج
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="reservations" dir="rtl">
          <TabsList className="bg-muted/50 rounded-xl mb-6">
            <TabsTrigger value="reservations" className="rounded-lg font-heading">الحجوزات</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="settings" className="rounded-lg font-heading">الإعدادات</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="reservations">
            {/* Filters */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {["all", "waiting", "serving", "completed", "cancelled"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-heading transition-all",
                    filterStatus === s ? "gradient-primary font-bold" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s === "all" ? "الكل" : statusLabels[s]?.label}
                  {s !== "all" && (
                    <span className="mr-1 text-xs">
                      ({reservations.filter((r) => r.status === s).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {Object.entries(statusLabels).map(([key, val]) => {
                const count = reservations.filter((r) => r.status === key).length;
                const Icon = val.icon;
                return (
                  <div key={key} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{val.label}</span>
                    </div>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                );
              })}
            </div>

            {/* Reservations List */}
            <div className="space-y-3">
              {filtered.length === 0 && (
                <p className="text-center text-muted-foreground py-12">لا توجد حجوزات</p>
              )}
              {filtered.map((r) => {
                const status = statusLabels[r.status] || statusLabels.waiting;
                return (
                  <div key={r.id} className="glass rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-heading font-bold text-lg">{r.customer_name}</h3>
                        <p className="text-sm text-muted-foreground" dir="ltr">{r.phone}</p>
                      </div>
                      <div className="text-left">
                        <span className={cn("text-xs px-3 py-1 rounded-full font-medium", status.color)}>
                          {status.label}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">#{r.reservation_code}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                      <div>
                        <span className="text-muted-foreground text-xs">التاريخ</span>
                        <p className="font-medium">{r.reservation_date}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">الوقت</span>
                        <p className="font-medium">{r.reservation_time?.slice(0, 5)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">عدد</span>
                        <p className="font-medium">{r.party_size} أشخاص</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">الطاولة</span>
                        <p className="font-medium">{tableTypeLabels[r.table_type] || r.table_type}</p>
                      </div>
                    </div>

                    {/* Duration/Departure controls */}
                    {(r.status === "waiting" || r.status === "serving") && (
                      <div className="border-t border-border/50 pt-3">
                        <div className="flex flex-wrap gap-2 items-center mb-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">المدة (دقيقة):</Label>
                            <Input
                              type="number"
                              defaultValue={r.duration_minutes || ""}
                              className="w-20 h-8 text-sm bg-muted/50 rounded-lg"
                              dir="ltr"
                              onBlur={(e) => {
                                const v = parseInt(e.target.value);
                                if (v > 0) setDuration(r.id, v);
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">موعد المغادرة:</Label>
                            <Input
                              type="datetime-local"
                              defaultValue={r.departure_time?.slice(0, 16) || ""}
                              className="h-8 text-sm bg-muted/50 rounded-lg"
                              dir="ltr"
                              onBlur={(e) => {
                                if (e.target.value) setDepartureTime(r.id, e.target.value);
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {r.status === "waiting" && (
                            <Button
                              size="sm"
                              className="gradient-primary rounded-lg font-heading"
                              onClick={() => updateStatus(r.id, "serving")}
                            >
                              نقل إلى الخدمة
                            </Button>
                          )}
                          {r.status === "serving" && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 rounded-lg font-heading"
                              onClick={() => updateStatus(r.id, "completed")}
                            >
                              <CheckCircle className="h-3 w-3 ml-1" />
                              مكتمل
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg font-heading text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => updateStatus(r.id, "cancelled")}
                          >
                            إلغاء
                          </Button>
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
                    onChange={(e) => setBufferMinutes(parseInt(e.target.value) || 0)}
                    className="w-24 bg-muted/50 rounded-xl"
                    dir="ltr"
                  />
                  <span className="text-sm text-muted-foreground">دقيقة</span>
                  <Button onClick={updateBufferDuration} className="gradient-primary rounded-xl font-heading">
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
                    <div key={i} className="relative group rounded-xl overflow-hidden aspect-video">
                      <img src={url} alt="" className="w-full h-full object-cover" />
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
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                </label>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
