import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import heroDefault from "@/assets/hero-default.jpg";

const HeroSection = () => {
  const navigate = useNavigate();
  const [heroImage, setHeroImage] = useState<string>(heroDefault);
  const [waitingCount, setWaitingCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchHeroImages = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "hero_images")
        .single();

      if (data) {
        const images = data.value as string[];
        if (Array.isArray(images) && images.length > 0) {
          setHeroImage(images[0]);
        }
      }
    };

    const fetchWaitingCount = async () => {
      const { count, error } = await supabase
        .from("reservations")
        .select("*", { count: "exact", head: true } as any)
        .eq("status", "waiting");

      if (!error) {
        setWaitingCount(count ?? 0);
      }
    };

    fetchHeroImages();
    fetchWaitingCount();
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="مطعم كايا"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-3xl mx-auto animate-fade-in flex flex-col items-center">
        {/* Logo Image */}
        <h1 className="mb-6 flex justify-center">
          <img
            src="/logo.jpg"
            alt="KAYA Logo"
            className="h-[200px] md:h-[300px] rounded-[50px] w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 duration-300"
          />
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground font-heading mb-6">
          تجربة طعام استثنائية
        </p>

        {waitingCount !== null && (
          <p className="text-sm md:text-base text-muted-foreground mb-6">
            يوجد حاليًا{" "}
            <span className="font-bold text-primary">
              {waitingCount}
            </span>{" "}
            {waitingCount === 1 ? "عميل" : "عملاء"} في قائمة الانتظار
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            size="lg"
            className="gradient-primary text-lg px-10 py-6 rounded-xl font-heading font-bold shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-105"
            onClick={() => navigate("/reserve")}
          >
            <Users className="ml-2 h-5 w-5" />
            انضم لقائمة الانتظار
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="text-lg px-10 py-6 rounded-xl font-heading border-border/50 hover:bg-muted/50"
            onClick={() => navigate("/my-reservations")}
          >
            حجوزاتي
          </Button>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
