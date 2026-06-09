package com.novasoft.psicoapp.service;

import com.novasoft.psicoapp.model.*;
import com.novasoft.psicoapp.repo.*;
import org.springframework.boot.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {
  private final UserRepo users;
  private final CaseRepo cases;
  private final ScenarioRepo scenarios;
  private final QuestionRepo questions;
  private final OptionRepo options;
  private final PasswordEncoder enc;

  public DataInitializer(UserRepo u, CaseRepo c, ScenarioRepo s, QuestionRepo q, OptionRepo o, PasswordEncoder e) {
    users = u; cases = c; scenarios = s; questions = q; options = o; enc = e;
  }

  public void run(String... args) {
    seedUser("admin@psicoapp.com", "Administrador", Role.ADMIN);
    seedUser("profesor@psicoapp.com", "Profesor Demo", Role.PROFESOR);
    seedUser("estudiante@psicoapp.com", "Estudiante Demo", Role.ESTUDIANTE);

    if (cases.count() == 0) {
      User prof = users.findByEmail("profesor@psicoapp.com").orElseThrow();
      CaseStudy cs = new CaseStudy();
      cs.title = "Caso demo: Conflicto grupal";
      cs.category = "Psicologia social";
      cs.difficulty = "Media";
      cs.description = "Un grupo de estudiantes presenta conflicto por liderazgo, comunicacion y presion social.";
      cs.professor = prof;
      cases.save(cs);

      Scenario sc = new Scenario();
      sc.title = "Intervencion inicial";
      sc.contextText = "El estudiante debe decidir el primer paso de intervencion profesional.";
      sc.blockType = "QUESTION";
      sc.orderIndex = 1;
      sc.caseStudy = cs;
      scenarios.save(sc);

      Question q = new Question();
      q.text = "Cual es la accion inicial mas adecuada?";
      q.score = 10;
      q.scenario = sc;
      questions.save(q);

      add(q, "Escuchar a las partes y recopilar informacion antes de intervenir", true, "Primero se debe comprender el contexto y evitar juicios precipitados.");
      add(q, "Tomar partido por el lider mas influyente", false, "Tomar partido aumenta el sesgo y el conflicto.");
      add(q, "Ignorar el conflicto hasta que desaparezca", false, "La omision puede agravar el problema.");
    }
    normalizeExistingBlocks();
  }

  void seedUser(String email, String name, Role role) {
    if (users.findByEmail(email).isEmpty()) {
      User u = new User();
      u.email = email;
      u.name = name;
      u.role = role;
      u.password = enc.encode("123456");
      users.save(u);
    }
  }

  void add(Question q, String text, boolean ok, String just) {
    AnswerOption o = new AnswerOption();
    o.question = q;
    o.text = text;
    o.correct = ok;
    o.justification = just;
    options.save(o);
  }

  void normalizeExistingBlocks() {
    for (Scenario s : scenarios.findAll()) {
      boolean changed = false;
      if (s.blockType == null || s.blockType.isBlank()) {
        s.blockType = questions.findByScenarioIdOrderByOrderIndexAsc(s.id).isEmpty() ? "TEXT" : "QUESTION";
        changed = true;
      }
      if (s.orderIndex <= 0) {
        s.orderIndex = s.id == null ? 1 : s.id.intValue();
        changed = true;
      }
      if (changed) scenarios.save(s);
    }
  }
}
