-- Create Pantries Table
CREATE TABLE public.pantries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    box_rules JSONB DEFAULT '{"grain": 2, "vegetable": 2, "protein": 2, "breakfast": 1, "snack": 1, "hygiene": 1, "baby": 0}'::jsonb,
    thresholds JSONB DEFAULT '{"grain": 15, "vegetable": 15, "protein": 15, "breakfast": 10, "snack": 10, "hygiene": 8, "baby": 5}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Pantry Members Table
CREATE TABLE public.pantry_members (
    pantry_id UUID REFERENCES public.pantries(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'volunteer')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (pantry_id, user_id)
);

-- Create Inventory Table
CREATE TABLE public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pantry_id UUID REFERENCES public.pantries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown')),
    count INTEGER NOT NULL DEFAULT 1,
    expiration DATE,
    date_added DATE DEFAULT CURRENT_DATE,
    source TEXT NOT NULL CHECK (source IN ('donation', 'shelf_audit', 'manual')),
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Activities Table
CREATE TABLE public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pantry_id UUID REFERENCES public.pantries(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    time TEXT NOT NULL,
    icon TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS setup
ALTER TABLE public.pantries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Pantries: Users can view pantries they are a member of
CREATE POLICY "Users can view pantries they belong to" 
ON public.pantries FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.pantry_members WHERE pantry_id = id AND user_id = auth.uid()));

-- Pantries: Anyone can view a pantry by invite_code (for joining)
CREATE POLICY "Users can view pantries by invite code" 
ON public.pantries FOR SELECT 
USING (true);

-- Pantries: Admins can update their pantry
CREATE POLICY "Admins can update pantries" 
ON public.pantries FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.pantry_members WHERE pantry_id = id AND user_id = auth.uid() AND role = 'admin'));

-- Pantry Members: Users can view members of their pantries
CREATE POLICY "Users can view members of their pantries" 
ON public.pantry_members FOR SELECT 
USING (pantry_id IN (SELECT pantry_id FROM public.pantry_members WHERE user_id = auth.uid()));

-- Inventory: Users can view, insert, update, delete inventory in their pantries
CREATE POLICY "Users can manage inventory in their pantries" 
ON public.inventory FOR ALL
USING (pantry_id IN (SELECT pantry_id FROM public.pantry_members WHERE user_id = auth.uid()));

-- Activities: Users can view, insert activities in their pantries
CREATE POLICY "Users can manage activities in their pantries" 
ON public.activities FOR ALL
USING (pantry_id IN (SELECT pantry_id FROM public.pantry_members WHERE user_id = auth.uid()));
