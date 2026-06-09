package com.novasoft.psicoapp.controller;

import com.novasoft.psicoapp.model.User;
import com.novasoft.psicoapp.repo.UserRepo;
import com.novasoft.psicoapp.service.CurrentUser;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/account")
public class AccountController {
  private final CurrentUser current;
  private final UserRepo users;
  private final PasswordEncoder enc;

  public AccountController(CurrentUser current, UserRepo users, PasswordEncoder enc) {
    this.current = current;
    this.users = users;
    this.enc = enc;
  }

  public record ChangePasswordReq(String currentPassword, String newPassword) {}

  @PostMapping("/password")
  public Map<String, String> changePassword(@RequestBody ChangePasswordReq req) {
    if (req.currentPassword() == null || req.currentPassword().isBlank()) {
      throw new RuntimeException("Ingresa tu contrasena actual");
    }
    if (req.newPassword() == null || req.newPassword().length() < 6) {
      throw new RuntimeException("La nueva contrasena debe tener al menos 6 caracteres");
    }
    User user = current.get();
    if (!enc.matches(req.currentPassword(), user.password)) {
      throw new RuntimeException("La contrasena actual no es correcta");
    }
    user.password = enc.encode(req.newPassword());
    users.save(user);
    return Map.of("message", "Contrasena actualizada");
  }
}
