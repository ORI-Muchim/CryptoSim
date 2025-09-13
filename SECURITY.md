# CryptoSim Security Guide

## 🔐 Critical Security Setup

### 1. JWT Secret Configuration

**⚠️ CRITICAL:** Never use the default JWT secret in production!

```bash
# Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Set in environment
export JWT_SECRET="your_generated_secret_here"
```

### 2. Environment Configuration

1. Create `.env` file (no `.env.example` provided):
   ```bash
   touch .env
   ```

2. Add the following critical settings:
   - `JWT_SECRET`: Use a secure 64+ character random string
   - `CORS_ORIGIN`: Set to your production domain(s)
   - `NODE_ENV`: Set to "production" for production deployments

### 3. Production Deployment Checklist

- [ ] JWT_SECRET environment variable is set (64+ characters)
- [ ] CORS_ORIGIN is configured for your domain only
- [ ] NODE_ENV is set to "production"
- [ ] HTTPS is enabled with valid SSL certificates
- [ ] Rate limiting is configured appropriately
- [ ] Database files have proper permissions (600)
- [ ] Log files are secured and rotated
- [ ] Firewall rules restrict access to necessary ports only

## 🛡️ Security Features

### Authentication & Authorization
- **JWT Tokens**: 7-day expiration with secure secret
- **Password Hashing**: Bcrypt with salt rounds (10)
- **Rate Limiting**: 
  - General API: 100 requests per 15 minutes per IP
  - Authentication endpoints: 5 attempts per 15 minutes (failed attempts only)
- **Session Management**: Token-based authentication

### Content Security Policy (CSP)
- CSP headers with SHA256 hashes for inline styles
- Development mode allows unsafe-inline for debugging
- Allowlisted external resources (fonts.googleapis.com, cdnjs.cloudflare.com, unpkg.com, cdn.jsdelivr.net)
- XSS attack prevention
- Clickjacking protection (X-Frame-Options: DENY)

### CORS Protection
- Origin validation in production (requires CORS_ORIGIN env variable)
- Development mode allows localhost:3000, 127.0.0.1:3000, localhost:3001
- Credential support enabled
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS
- Allowed headers: Content-Type, Authorization, X-Requested-With
- Preflight cache: 24 hours

### Additional Security Headers
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- X-XSS-Protection: 1; mode=block

## 🚨 Security Warnings

### Development vs Production

**Development Mode:**
- Allows unsafe-inline CSS/JS for easier debugging
- Permits localhost origins (3000, 3001)
- Auto-generates JWT secret with warning (not secure)
- CORS logging enabled

**Production Mode:**
- CSP with SHA256 hashes for inline styles (no unsafe-inline)
- Only CORS_ORIGIN environment variable domains allowed
- Requires explicit JWT_SECRET (minimum 32 characters) or fails to start
- No CORS logging

### Common Vulnerabilities Prevented

1. **SQL Injection**: Prepared statements and parameterized queries
2. **XSS Attacks**: Strict CSP and input sanitization
3. **CSRF Attacks**: SameSite cookies and origin validation
4. **Clickjacking**: X-Frame-Options headers
5. **MIME Sniffing**: X-Content-Type-Options headers

## 🔍 Security Monitoring

### Automatic Alerts
- Failed login attempts (rate limiting)
- Unauthorized CORS requests
- High resource usage
- WebSocket connection anomalies

### Log Monitoring
Check logs for:
- `CORS blocked request from unauthorized origin`
- `CRITICAL SECURITY ERROR: JWT_SECRET environment variable is required in production!`
- `SECURITY ERROR: JWT_SECRET must be at least 32 characters long!`
- `Too many requests from this IP`
- `Too many authentication attempts`
- Failed authentication attempts

## 📞 Security Incident Response

1. **Immediate Actions:**
   - Rotate JWT_SECRET immediately
   - Check access logs for suspicious activity
   - Verify CORS and CSP configurations

2. **Investigation:**
   - Review performance and error logs
   - Check database for unauthorized modifications
   - Verify WebSocket connection logs

3. **Recovery:**
   - Update security configurations
   - Force user re-authentication
   - Monitor for continued suspicious activity

## 🔧 Security Testing

### Manual Testing
```bash
# Test CORS restrictions
curl -H "Origin: https://malicious-site.com" http://localhost:3000/api/user/data

# Test rate limiting
for i in {1..101}; do curl http://localhost:3000/api/login; done

# Test JWT validation
curl -H "Authorization: Bearer invalid_token" http://localhost:3000/api/user/data
```

### Automated Security Checks
- Run `npm audit` regularly for dependency vulnerabilities
- Use security linting with ESLint security plugins
- Implement CI/CD security scanning

## 📋 Compliance Notes

- Passwords are hashed with industry-standard bcrypt
- JWT tokens include expiration and are properly validated
- All user inputs are sanitized and validated
- Rate limiting prevents brute force attacks
- Comprehensive logging for audit trails
- Secure headers prevent common web vulnerabilities

---

**Remember:** Security is an ongoing process. Regularly review and update these configurations as threats evolve.