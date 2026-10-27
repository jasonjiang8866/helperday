-- All household writes go through role-checked RPCs. No service key in the app.
create table public.households (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 80),
 rest_day int not null default 0 check (rest_day between 0 and 6), created_at timestamptz not null default now()
);
create table public.members (
 id uuid primary key references auth.users(id) on delete cascade,
 household_id uuid not null references public.households(id), name text not null check (length(trim(name)) between 1 and 60),
 role text not null check (role in ('employer','helper'))
);
create table public.invites (
 token uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
 role text not null check (role in ('employer','helper')), expires_at timestamptz not null default now() + interval '7 days', used_by uuid references auth.users(id)
);
create table public.task_templates (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
 title text not null check (length(trim(title)) between 1 and 120), instructions text not null default '' check(length(instructions)<=2000),
 category text not null check (category in ('Home care','Kitchen','Family','Errands')),
 start_date date not null, due_time time not null, assignee uuid references public.members(id),
 repeat text not null check (repeat in ('once','daily','weekly')), skip_rest_day boolean not null default true
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id), template_id uuid not null references public.task_templates(id),
 title text not null, instructions text not null, category text not null, due_date date not null, due_time time not null,
 assignee uuid references public.members(id), status text not null default 'todo' check(status in ('todo','done','needs_help')),
 feedback text not null default '' check(length(feedback)<=2000), version int not null default 0,
 unique(template_id,due_date)
);
create index tasks_household_date on public.tasks(household_id,due_date);
create index members_household on public.members(household_id);
create table public.task_events (
 id uuid primary key, task_id uuid not null references public.tasks(id), actor uuid not null references auth.users(id),
 status text not null, feedback text not null, created_at timestamptz not null default now()
);
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.task_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;
-- SECURITY DEFINER functions own access control; table writes are never granted to clients.
create function public.my_household() returns uuid language sql stable security definer set search_path=public as $$
 select household_id from public.members where id=auth.uid()
$$;
create policy household_read on public.households for select to authenticated using(id=public.my_household());
create policy members_read on public.members for select to authenticated using(household_id=public.my_household());
create policy templates_read on public.task_templates for select to authenticated using(household_id=public.my_household());
create policy tasks_read on public.tasks for select to authenticated using(household_id=public.my_household());

create function public.create_household(p_name text,p_member_name text,p_rest_day int default 0) returns uuid
language plpgsql security definer set search_path=public as $$
declare h uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if exists(select 1 from members where id=auth.uid()) then raise exception 'You already belong to a household'; end if;
 insert into households(name,rest_day) values(trim(p_name),p_rest_day) returning id into h;
 insert into members(id,household_id,name,role) values(auth.uid(),h,trim(p_member_name),'employer');
 return h;
end $$;
create function public.create_invite(p_role text default 'helper') returns uuid
language plpgsql security definer set search_path=public as $$
declare m members; token uuid;
begin
 select * into m from members where id=auth.uid();
 if m.role is distinct from 'employer' then raise exception 'Only an employer can invite members'; end if;
 insert into invites(household_id,role) values(m.household_id,p_role) returning invites.token into token;
 return token;
end $$;
create function public.join_household(p_token uuid,p_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare i invites;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into i from invites where token=p_token for update;
 if i.token is null or i.used_by is not null or i.expires_at<now() then raise exception 'Invitation is invalid, used or expired'; end if;
 if exists(select 1 from members where id=auth.uid()) then raise exception 'You already belong to a household'; end if;
 insert into members(id,household_id,name,role) values(auth.uid(),i.household_id,trim(p_name),i.role);
 update invites set used_by=auth.uid() where token=p_token;
 return i.household_id;
end $$;
create function public.create_task(p_task jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare m members; t uuid; a uuid;
begin
 select * into m from members where id=auth.uid();
 if m.role is distinct from 'employer' then raise exception 'Only an employer can schedule tasks'; end if;
 a := nullif(p_task->>'assignee','')::uuid;
 if a is not null and not exists(select 1 from members where id=a and household_id=m.household_id) then raise exception 'Assignee must be in your household'; end if;
 insert into task_templates(household_id,title,instructions,category,start_date,due_time,assignee,repeat,skip_rest_day)
 values(m.household_id,trim(p_task->>'title'),coalesce(p_task->>'instructions',''),p_task->>'category',(p_task->>'start_date')::date,
 (p_task->>'due_time')::time,a,p_task->>'repeat',coalesce((p_task->>'skip_rest_day')::boolean,true)) returning id into t;
 return t;
end $$;
create function public.dashboard(p_from date) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m members; h households;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into m from members where id=auth.uid();
 if m.id is null then return jsonb_build_object('household',null,'members','[]'::jsonb,'tasks','[]'::jsonb,'user_id',auth.uid()); end if;
 select * into h from households where id=m.household_id;
 -- Rolling window; unique(template_id,due_date) makes materialization safe to repeat.
 insert into tasks(household_id,template_id,title,instructions,category,due_date,due_time,assignee)
 select t.household_id,t.id,t.title,t.instructions,t.category,d::date,t.due_time,t.assignee
 from task_templates t cross join generate_series(p_from::timestamp,(p_from+34)::timestamp,interval '1 day') d
 where t.household_id=m.household_id and d::date>=t.start_date
 and (t.repeat='daily' or (t.repeat='once' and d::date=t.start_date) or (t.repeat='weekly' and extract(dow from d)=extract(dow from t.start_date)))
 and (not t.skip_rest_day or extract(dow from d)<>h.rest_day)
 on conflict(template_id,due_date) do nothing;
 return jsonb_build_object('household',to_jsonb(h),'user_id',auth.uid(),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role) order by name) from members where household_id=m.household_id),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by due_date,due_time,title) from tasks t where household_id=m.household_id and due_date between p_from and p_from+34),'[]'::jsonb));
end $$;
create function public.update_task(p_id uuid,p_mutation uuid,p_status text,p_feedback text,p_version int) returns void
language plpgsql security definer set search_path=public as $$
declare m members; t tasks;
begin
 select * into m from members where id=auth.uid();
 select * into t from tasks where id=p_id for update;
 if m.id is null or t.id is null or t.household_id<>m.household_id then raise exception 'Task is not accessible'; end if;
 if m.role='helper' and t.assignee is not null and t.assignee<>m.id then raise exception 'This task is assigned to another person'; end if;
 if exists(select 1 from task_events where id=p_mutation and actor=m.id and task_id=p_id) then return; end if;
 if t.version<>p_version then raise exception 'CONFLICT: task changed on another device. Review the latest version.'; end if;
 if p_status is null or p_status not in ('todo','done','needs_help') or p_feedback is null or length(p_feedback)>2000 then raise exception 'Invalid task update'; end if;
 update tasks set status=p_status,feedback=p_feedback,version=version+1 where id=p_id;
 insert into task_events(id,task_id,actor,status,feedback) values(p_mutation,p_id,m.id,p_status,p_feedback);
end $$;
-- Explicit grants also neutralize Supabase default table/function privileges.
revoke all on public.households,public.members,public.invites,public.task_templates,public.tasks,public.task_events from anon,authenticated;
grant select on public.households,public.members,public.task_templates,public.tasks to authenticated;
revoke all on function public.my_household(),public.create_household(text,text,int),public.create_invite(text),public.join_household(uuid,text),public.create_task(jsonb),public.dashboard(date),public.update_task(uuid,uuid,text,text,int) from public,anon;
grant execute on function public.my_household(),public.create_household(text,text,int),public.create_invite(text),public.join_household(uuid,text),public.create_task(jsonb),public.dashboard(date),public.update_task(uuid,uuid,text,text,int) to authenticated;
