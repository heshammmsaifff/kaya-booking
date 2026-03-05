
-- Create enum for reservation status
CREATE TYPE public.reservation_status AS ENUM ('waiting', 'serving', 'completed', 'cancelled');

-- Create enum for table type
CREATE TYPE public.table_type AS ENUM ('indoor', 'outdoor', 'vip', 'private');

-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('admin', 'cashier');

-- Create reservations table
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  table_type public.table_type NOT NULL DEFAULT 'indoor',
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  status public.reservation_status NOT NULL DEFAULT 'waiting',
  duration_minutes INTEGER,
  departure_time TIMESTAMPTZ,
  reservation_code TEXT NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 6)),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create site_settings table
CREATE TABLE public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS helper function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Reservations policies
CREATE POLICY "Anyone can create reservations" ON public.reservations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can read reservations" ON public.reservations
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can update reservations" ON public.reservations
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Site settings policies
CREATE POLICY "Anyone can read site settings" ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin can insert site settings" ON public.site_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update site settings" ON public.site_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete site settings" ON public.site_settings
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage user roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete user roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Insert default site settings
INSERT INTO public.site_settings (key, value) VALUES
  ('hero_images', '[]'::jsonb),
  ('buffer_duration', '{"minutes": 15}'::jsonb);

-- Create storage bucket for hero images
INSERT INTO storage.buckets (id, name, public) VALUES ('hero-images', 'hero-images', true);

CREATE POLICY "Anyone can read hero images" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'hero-images');

CREATE POLICY "Admin can upload hero images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update hero images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete hero images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'));
