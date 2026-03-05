import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { CalendarIcon, ArrowRight, Minus, Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Swal from "sweetalert2";

const timeSlots = [
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00",
];

const tableTypes = [
  { value: "indoor", label: "داخلي" },
  { value: "outdoor", label: "خارجي" },
  { value: "vip", label: "VIP" },
  { value: "private", label: "خاص" },
];

const tableTypeLabels: Record<string, string> = {
  indoor: "داخلي",
  outdoor: "خارجي",
  vip: "VIP",
  private: "خاص",
};

const Reserve = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tableType, setTableType] = useState("");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [reservationCode, setReservationCode] = useState("");

  const validateStep2 = () => {
    if (!name.trim() || name.trim().length < 3) {
      Swal.fire({
        icon: "error",
        title: "خطأ",
        text: "يرجى إدخال الاسم بالكامل (3 أحرف على الأقل)",
        confirmButtonColor: "hsl(200, 46%, 39%)",
      });
      return false;
    }
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phone)) {
      Swal.fire({
        icon: "error",
        title: "خطأ",
        text: "يرجى إدخال رقم جوال صحيح (مثال: 05XXXXXXXX)",
        confirmButtonColor: "hsl(200, 46%, 39%)",
      });
      return false;
    }
    if (!tableType) {
      Swal.fire({
        icon: "error",
        title: "خطأ",
        text: "يرجى اختيار نوع الطاولة",
        confirmButtonColor: "hsl(200, 46%, 39%)",
      });
      return false;
    }
    return true;
  };

  const handleStep2Next = () => {
    if (validateStep2()) {
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    if (!date || !time) {
      Swal.fire({
        icon: "error",
        title: "خطأ",
        text: "يرجى اختيار التاريخ والوقت",
        confirmButtonColor: "hsl(200, 46%, 39%)",
      });
      return;
    }

    const result = await Swal.fire({
      title: "تأكيد الحجز",
      html: `
        <div style="text-align: right; direction: rtl; font-family: 'Tajawal', sans-serif;">
          <p style="margin-bottom: 8px;"><strong>الاسم:</strong> ${name}</p>
          <p style="margin-bottom: 8px;"><strong>الجوال:</strong> <span dir="ltr">${phone}</span></p>
          <p style="margin-bottom: 8px;"><strong>عدد الأشخاص:</strong> ${partySize}</p>
          <p style="margin-bottom: 8px;"><strong>نوع الطاولة:</strong> ${tableTypeLabels[tableType]}</p>
          <p style="margin-bottom: 8px;"><strong>التاريخ:</strong> ${format(date, "PPP", { locale: ar })}</p>
          <p><strong>الوقت:</strong> ${time}</p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "تأكيد الحجز",
      cancelButtonText: "تعديل",
      confirmButtonColor: "hsl(200, 46%, 39%)",
      cancelButtonColor: "#6c757d",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reservations")
        .insert({
          customer_name: name,
          phone,
          party_size: partySize,
          table_type: tableType as any,
          reservation_date: format(date, "yyyy-MM-dd"),
          reservation_time: time + ":00",
        })
        .select("reservation_code")
        .single();

      if (error) throw error;
      setReservationCode(data.reservation_code);
      setStep(4);
      Swal.fire({
        icon: "success",
        title: "تم الحجز بنجاح!",
        text: `كود الحجز: ${data.reservation_code}`,
        confirmButtonColor: "hsl(200, 46%, 39%)",
      });
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "خطأ",
        text: "حدث خطأ أثناء الحجز، يرجى المحاولة مرة أخرى",
        confirmButtonColor: "hsl(200, 46%, 39%)",
      });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <button
          onClick={() => step > 1 ? setStep(step - 1) : navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 font-heading"
        >
          <ArrowRight className="h-4 w-4" />
          {step > 1 ? "رجوع" : "الرئيسية"}
        </button>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                s <= step ? "gradient-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step 1: Party Size */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="font-heading text-3xl font-bold mb-2">عدد الأشخاص</h2>
            <p className="text-muted-foreground mb-8">كم عدد الضيوف؟</p>

            <div className="glass rounded-2xl p-8 flex items-center justify-center gap-6">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => setPartySize(Math.max(1, partySize - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <span className="text-5xl font-bold gradient-text">{partySize}</span>
                <p className="text-muted-foreground text-sm mt-1">
                  {partySize === 1 ? "شخص" : partySize <= 10 ? "أشخاص" : "شخص"}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 rounded-full"
                onClick={() => setPartySize(Math.min(20, partySize + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <Button
              className="w-full mt-8 gradient-primary py-6 text-lg font-heading font-bold rounded-xl"
              onClick={() => setStep(2)}
            >
              التالي
            </Button>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div className="animate-fade-in space-y-5">
            <h2 className="font-heading text-3xl font-bold mb-2">بياناتك</h2>
            <p className="text-muted-foreground mb-6">أدخل معلومات الحجز</p>

            <div className="space-y-4">
              <div>
                <Label className="font-heading mb-2 block">الاسم بالكامل</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="أدخل اسمك الكامل"
                  className="bg-muted/50 border-border/50 py-5 rounded-xl text-right"
                />
              </div>
              <div>
                <Label className="font-heading mb-2 block">رقم الجوال</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="bg-muted/50 border-border/50 py-5 rounded-xl"
                  dir="ltr"
                  maxLength={10}
                />
              </div>
              <div>
                <Label className="font-heading mb-2 block">نوع الطاولة</Label>
                <Select value={tableType} onValueChange={setTableType}>
                  <SelectTrigger className="bg-muted/50 border-border/50 py-5 rounded-xl">
                    <SelectValue placeholder="اختر نوع الطاولة" />
                  </SelectTrigger>
                  <SelectContent>
                    {tableTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="w-full mt-6 gradient-primary py-6 text-lg font-heading font-bold rounded-xl"
              onClick={handleStep2Next}
              disabled={!name || !phone || !tableType}
            >
              التالي
            </Button>
          </div>
        )}

        {/* Step 3: Date & Time */}
        {step === 3 && (
          <div className="animate-fade-in space-y-5">
            <h2 className="font-heading text-3xl font-bold mb-2">الموعد</h2>
            <p className="text-muted-foreground mb-6">اختر التاريخ والوقت</p>

            <div>
              <Label className="font-heading mb-2 block">تاريخ الحجز</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-right py-5 rounded-xl bg-muted/50 border-border/50",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {date ? format(date, "PPP", { locale: ar }) : "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => d < new Date()}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="font-heading mb-2 block">وقت الحجز</Label>
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {timeSlots.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTime(t)}
                    className={cn(
                      "py-2 px-3 rounded-lg text-sm font-medium transition-all",
                      time === t
                        ? "gradient-primary text-foreground shadow-lg"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="w-full mt-6 gradient-primary py-6 text-lg font-heading font-bold rounded-xl"
              onClick={handleSubmit}
              disabled={!date || !time || loading}
            >
              {loading ? "جاري الحجز..." : "تأكيد الحجز"}
            </Button>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="animate-fade-in text-center">
            <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center mx-auto mb-6">
              <Check className="h-10 w-10 text-foreground" />
            </div>
            <h2 className="font-heading text-3xl font-bold mb-2">تم الحجز بنجاح!</h2>
            <p className="text-muted-foreground mb-6">كود الحجز الخاص بك</p>

            <div className="glass rounded-2xl p-6 mb-8">
              <p className="text-4xl font-mono font-bold gradient-text tracking-widest">
                {reservationCode}
              </p>
              <p className="text-muted-foreground text-sm mt-2">احتفظ بهذا الكود</p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 py-5 rounded-xl font-heading"
                onClick={() => navigate("/")}
              >
                الرئيسية
              </Button>
              <Button
                className="flex-1 py-5 rounded-xl font-heading gradient-primary"
                onClick={() => navigate("/my-reservations")}
              >
                حجوزاتي
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reserve;
