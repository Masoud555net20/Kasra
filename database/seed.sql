INSERT OR IGNORE INTO users (id, username, password, full_name, role, signature, is_active)
VALUES
  ('u1', 'admin', '123456', 'مدیر سیستم', 'مدیر سیستم', NULL, 1),
  ('u2', 'hamed', '123456', 'حامد خیرآبادی', 'کارشناس', NULL, 1);

INSERT OR IGNORE INTO projects (id, title, code, client, status, description, created_by)
VALUES
  ('p1', 'پروژه نوسازی مدارس', 'PRJ-MED', 'اداره کل نوسازی تهران', 'فعال', 'پروژه مدارس و نوسازی فضاهای آموزشی', 'u1'),
  ('p2', 'پروژه صنعت نفت', 'PRJ-OIL', 'بهداشت و درمان نفت', 'فعال', 'مأموریت‌های مرتبط با پروژه نفت و خدمات فنی', 'u1'),
  ('p3', 'پروژه عمومی و اداری', 'PRJ-GEN', 'داخلی شرکت', 'فعال', 'پروژه‌های اداری و خدمات عمومی', 'u1');

INSERT OR IGNORE INTO missions (
  id, user_id, username, row_no, mission_date, day_name, project_id, project_title, location, address,
  start_time, end_time, outbound_vehicle, outbound_cost, inbound_vehicle, inbound_cost, total_cost, status
)
VALUES
  (
    '1', 'u2', 'hamed', 1, '1405/03/03', 'یکشنبه', 'p2', 'پروژه صنعت نفت',
    'بهداشت و درمان صنعت نفت', 'خیابان به آفرین', '07:58', '10:10', 'شخصی', 900000, 'شخصی', 0, 900000, 'ثبت شده'
  ),
  (
    '2', 'u2', 'hamed', 2, '1405/03/03', 'یکشنبه', 'p1', 'پروژه نوسازی مدارس',
    'اداره کل نوسازی مدارس تهران', 'جردن', '10:30', '10:50', 'شخصی', 950000, 'شخصی', 0, 950000, 'ثبت شده'
  ),
  (
    '3', 'u2', 'hamed', 3, '1405/03/03', 'یکشنبه', 'p2', 'پروژه صنعت نفت',
    'نفت فلات قاره', 'پارک وی', '11:08', '12:15', 'شخصی', 0, 'شخصی', 700000, 700000, 'ثبت شده'
  );

INSERT OR IGNORE INTO settings (id, key, value, description)
VALUES
  ('cfg1', 'app_name', 'AKASRA', 'نام سامانه'),
  ('cfg2', 'currency', 'ریال', 'واحد پول سیستم'),
  ('cfg3', 'default_role', 'کارشناس', 'نقش پیش‌فرض کاربران');
