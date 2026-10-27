create table if not exists restaurant(
 id int primary key default 1 check(id=1),
 name text not null default 'The Daily Grind', phone text, email text, photo_url text,
 hours text default '08:00 - 23:00', tax_percent numeric(5,2) not null default 5,
 order_types text[] default '{Dine-in,Takeaway}', pay_methods text[] default '{reception,online_simulated}',
 plan text default 'Growth', subscription_start date default current_date, subscription_renew date default current_date + 30);
insert into restaurant(id) values(1) on conflict do nothing;
create table if not exists menu_items(
 id serial primary key, name text not null, description text default '', price numeric(10,2) not null check(price>0),
 category text not null default 'Other', emoji text default '🍽️', veg boolean not null default true, available boolean not null default true);
create table if not exists orders(
 id serial primary key, table_no text not null, customer_name text not null, note text default '',
 order_type text not null default 'Dine-in', pay_method text not null default 'reception', paid boolean not null default false, paid_at timestamptz,
 status text not null default 'New' check(status in ('New','Accepted','Preparing','Ready','Served','Rejected')),
 subtotal numeric(10,2) not null, tax numeric(10,2) not null, total numeric(10,2) not null,
 public_token text not null, created_at timestamptz not null default now());
create index if not exists orders_status_idx on orders(status, id desc);
create table if not exists order_items(
 id serial primary key, order_id int not null references orders(id) on delete cascade,
 item_id int references menu_items(id) on delete set null, name text not null, price numeric(10,2) not null, qty int not null check(qty>0));
create table if not exists ratings(order_id int primary key references orders(id) on delete cascade, stars int not null check(stars between 1 and 5), comment text default '', created_at timestamptz default now());
create table if not exists accounts(id serial primary key, hotel_name text not null, owner_name text not null, phone text not null unique, email text not null unique,
 address text not null, pincode text not null, city text not null, state text not null, password_hash text,
 status text not null default 'pending' check(status in ('pending','active','disabled')), created_at timestamptz default now());

-- Supabase safety: tables in the public schema are reachable through Supabase's public Data API.
-- Turn on Row Level Security with NO policies, so only this backend (direct Postgres login) can read or write them.
alter table restaurant enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table ratings enable row level security;
alter table accounts enable row level security;
