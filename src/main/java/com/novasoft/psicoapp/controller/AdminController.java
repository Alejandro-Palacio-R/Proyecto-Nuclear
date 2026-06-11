package com.novasoft.psicoapp.controller;

import com.novasoft.psicoapp.model.*;
import com.novasoft.psicoapp.repo.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {
  private final UserRepo users;
  private final PasswordEncoder enc;

  public AdminController(UserRepo u, PasswordEncoder e) {
    users = u;
    enc = e;
  }

  public record UserReq(String name, String email, Role role, String password, Boolean enabled) {}

  @GetMapping("/users")
  public List<User> users() {
    return users.findAll();
  }

  @PostMapping("/users")
  public User create(@RequestBody UserReq req) {
    validateRequired(req.name(), req.email(), req.role());
    if (users.findByEmail(req.email()).isPresent()) throw new RuntimeException("El correo ya existe");
    User u = new User();
    u.name = req.name();
    u.email = req.email();
    u.role = req.role();
    u.enabled = req.enabled() == null || req.enabled();
    u.password = enc.encode(req.password() == null || req.password().isBlank() ? "123456" : req.password());
    return users.save(u);
  }

  @PutMapping("/users/{id}")
  public User update(@PathVariable Long id, @RequestBody UserReq req) {
    validateRequired(req.name(), req.email(), req.role());
    User u = users.findById(id).orElseThrow();
    users.findByEmail(req.email()).filter(existing -> !existing.id.equals(id)).ifPresent(existing -> {
      throw new RuntimeException("El correo ya existe");
    });
    u.name = req.name();
    u.email = req.email();
    u.role = req.role();
    if (req.enabled() != null) u.enabled = req.enabled();
    if (req.password() != null && !req.password().isBlank()) u.password = enc.encode(req.password());
    return users.save(u);
  }

  @PutMapping("/users/{id}/role")
  public User role(@PathVariable Long id, @RequestBody Map<String, String> body) {
    User u = users.findById(id).orElseThrow();
    u.role = Role.valueOf(body.get("role"));
    return users.save(u);
  }

  @DeleteMapping("/users/{id}")
  public void delete(@PathVariable Long id) {
    users.deleteById(id);
  }

  private void validateRequired(String name, String email, Role role) {
    if (name == null || name.isBlank()) throw new RuntimeException("El nombre es obligatorio");
    if (email == null || email.isBlank()) throw new RuntimeException("El correo es obligatorio");
    if (role == null) throw new RuntimeException("El rol es obligatorio");
  }
}
