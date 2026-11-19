-- =====================================================================
-- 0016 문의 열 단위 권한 + 입점 승인 시 역할 부여 (남은 관리자 화면 정리) — P29·P30 해결
-- =====================================================================
-- P29: 문의(inquiries) 정책이 '어느 행을'만 정하고 '어느 열을'은 정하지 않았다.
--      - 고객 정책은 자기 문의 for all → 고객이 답변 내용·'답변완료'를 직접 쓸 수 있었다 (가짜 답변)
--      - 입점사 정책은 자기 브랜드 문의 update → 입점사가 고객이 쓴 질문 제목·내용을 고칠 수 있었다
--      → 트리거로 열 단위 규칙을 건다: 질문(제목·내용·유형·상품)은 작성한 고객만, 답변·처리 상태는 담당 입점사·본사만
--        답변은 answer_inquiry()로만 (작성자 이름·시각을 서버가 채움)
-- P30: 앱 어디에서도 user_roles를 쓰지 않는다 (설계상 쓰기 정책 없음). 그래서 입점 신청 → 본사 승인이
--      brand_admins.status만 바꾸고, 신청한 계정은 끝까지 '고객'으로 남아 입점사 기능을 쓸 수 없었다.
--      → approve_brand(): 본사만, 상태 active + 신청 계정(브랜드 이메일과 같은 로그인 계정)에 입점사 역할 부여를 한 트랜잭션으로
--        terminate_brand(): 계약 종료 + 판매 중 상품 숨김을 한 트랜잭션으로 (원본 화면은 두 번 나눠 쓰다 중간 실패 가능)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 문의 열 단위 규칙 (P29)
-- ---------------------------------------------------------------------
create or replace function private.guard_inquiries_write()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_is_author boolean := new.user_id is not distinct from (select auth.uid());
begin
  -- 서버 함수(answer_inquiry 등)·서버 전용 키·본사는 통과
  if current_user not in ('anon', 'authenticated') or private.is_hq() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 새 문의에는 답변이 있을 수 없다
    new.reply_content := null;
    new.reply_date    := null;
    new.assigned_to   := null;
    new.status        := '답변대기';
    return new;
  end if;

  -- 답변·처리 상태는 고객이 바꿀 수 없다 (입점사는 answer_inquiry로만)
  if (new.reply_content, new.reply_date, new.assigned_to, new.status)
     is distinct from (old.reply_content, old.reply_date, old.assigned_to, old.status) then
    raise exception '답변과 처리 상태는 담당자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  -- 질문은 작성한 고객만, 그리고 답변이 달리기 전까지만
  if (new.title, new.content, new.inquiry_type, new.category, new.product_id, new.user_id)
     is distinct from (old.title, old.content, old.inquiry_type, old.category, old.product_id, old.user_id) then
    if not v_is_author then
      raise exception '문의 내용은 작성한 고객만 바꿀 수 있습니다' using errcode = '42501';
    end if;
    if old.status = '답변완료' then
      raise exception '답변이 달린 문의는 수정할 수 없습니다' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger inquiries_guard_write
  before insert or update on public.inquiries
  for each row execute function private.guard_inquiries_write();

-- 답변 등록: 담당 입점사(문의의 브랜드) 또는 본사. 작성자 이름·시각은 서버가 정한다
create or replace function public.answer_inquiry(p_inquiry_id text, p_reply text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_brand_id bigint := private.my_brand_id();
  v_is_hq    boolean := private.is_hq();
  v_target   bigint;
  v_name     text;
begin
  if v_brand_id is null and not v_is_hq then
    raise exception '입점사·본사만 답변할 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reply), '') = '' then
    raise exception '답변 내용을 입력해 주세요' using errcode = '22023';
  end if;
  select i.brand_id into v_target from public.inquiries i where i.id::text = p_inquiry_id for update;
  if not found or (not v_is_hq and v_target is distinct from v_brand_id) then
    raise exception '문의를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  v_name := case when v_is_hq then '본사' else (select b.name from public.brand_admins b where b.id = v_brand_id) end;
  update public.inquiries
     set reply_content = btrim(p_reply),
         reply_date    = now(),
         assigned_to   = v_name,
         status        = '답변완료',
         updated_at    = now()
   where id::text = p_inquiry_id;
end;
$$;

revoke execute on function public.answer_inquiry(text, text) from public, anon;
grant  execute on function public.answer_inquiry(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. 입점 승인·계약 종료 (P30)
-- ---------------------------------------------------------------------
create or replace function public.approve_brand(p_brand_id bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_brand   public.brand_admins;
  v_user_id uuid;
  v_role    text;
begin
  if not private.is_hq() then
    raise exception '본사만 입점을 승인할 수 있습니다' using errcode = '42501';
  end if;
  select * into v_brand from public.brand_admins where id = p_brand_id for update;
  if not found then
    raise exception '입점사를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_brand.status = 'active' then
    raise exception '이미 계약 중인 입점사입니다' using errcode = '22023';
  end if;

  -- 신청 계정 = 브랜드 이메일과 같은 로그인 계정
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(v_brand.email);
  if v_user_id is not null then
    select r.role into v_role from public.user_roles r where r.user_id = v_user_id;
    if v_role = 'hq' then
      raise exception '본사 계정은 입점사로 지정할 수 없습니다' using errcode = '22023';
    end if;
    insert into public.user_roles (user_id, role, brand_id)
    values (v_user_id, 'merchant', p_brand_id)
    on conflict (user_id) do update set role = 'merchant', brand_id = excluded.brand_id;
  end if;

  update public.brand_admins
     set status = 'active', terminated_at = null,
         joined_at = case when v_brand.status = 'pending' then now() else joined_at end
   where id = p_brand_id;

  return jsonb_build_object('brand_id', p_brand_id, 'account_linked', v_user_id is not null);
end;
$$;

create or replace function public.terminate_brand(p_brand_id bigint)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_hidden integer;
begin
  if not private.is_hq() then
    raise exception '본사만 계약을 종료할 수 있습니다' using errcode = '42501';
  end if;
  update public.brand_admins set status = 'terminated', terminated_at = now()
   where id = p_brand_id and status <> 'terminated';
  if not found then
    raise exception '계약 중인 입점사가 아닙니다' using errcode = '22023';
  end if;
  -- 계약이 끝난 브랜드의 상품은 쇼핑몰에서 내린다 (입점사는 계약 상태 확인으로 이미 접근 불가 — P22)
  update public.products set status = 'hidden', updated_at = now()
   where brand_id = p_brand_id and status in ('forsale', 'soldout', 'pending');
  get diagnostics v_hidden = row_count;
  return v_hidden;
end;
$$;

revoke execute on function public.approve_brand(bigint)   from public, anon;
revoke execute on function public.terminate_brand(bigint) from public, anon;
grant  execute on function public.approve_brand(bigint)   to authenticated;
grant  execute on function public.terminate_brand(bigint) to authenticated;
