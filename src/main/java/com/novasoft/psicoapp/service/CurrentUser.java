package com.novasoft.psicoapp.service;
import com.novasoft.psicoapp.model.User; import com.novasoft.psicoapp.repo.UserRepo; import org.springframework.security.core.context.SecurityContextHolder; import org.springframework.stereotype.Service;
@Service public class CurrentUser{ private final UserRepo users; public CurrentUser(UserRepo u){users=u;} public User get(){String email=SecurityContextHolder.getContext().getAuthentication().getName(); return users.findByEmail(email).orElseThrow();}}
