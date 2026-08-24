# دیتابیس Cloudflare D1 برای پروژه KASRA

## 1) ساخت دیتابیس در Cloudflare

```bash
wrangler d1 create kasra-db
```

سپس مقدار `database_id` را از خروجی دستور بالا در فایل `wrangler.toml` جایگزین کنید.

## 2) اجرای اسکیمای اصلی

```bash
wrangler d1 execute kasra-db --file=./database/schema.sql
```

## 3) اجرای داده‌های اولیه

```bash
wrangler d1 execute kasra-db --file=./database/seed.sql
```

## 4) بررسی داده‌ها

```bash
wrangler d1 execute kasra-db --command="SELECT * FROM users;"
wrangler d1 execute kasra-db --command="SELECT * FROM projects;"
wrangler d1 execute kasra-db --command="SELECT * FROM missions;"
```

## جداول اصلی

- users: کاربران و حساب‌ها
- projects: پروژه‌ها
- missions: ثبت مأموریت‌ها
- login_logs: لاگ ورود و خروج
- activity_logs: لاگ عملکرد‌ها
- settings: تنظیمات سیستم

## نکته

اگر پروژه شما از Cloudflare Pages برای Frontend و Worker برای API استفاده کند، می‌توانید از binding `DB` در Worker برای خواندن و نوشتن در این دیتابیس استفاده کنید.
