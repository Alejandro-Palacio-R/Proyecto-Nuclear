package com.novasoft.psicoapp.controller;

import com.novasoft.psicoapp.model.*;
import com.novasoft.psicoapp.repo.*;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/teacher")
@PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
public class TeacherController {
  private final SubmissionRepo submissions;
  private final NotificationRepo notifications;

  public TeacherController(SubmissionRepo s, NotificationRepo n) {
    submissions = s; notifications = n;
  }

  @GetMapping("/submissions")
  public List<Submission> submissions() {
    return submissions.findAll();
  }

  @PutMapping("/submissions/{id}/grade")
  public Submission grade(@PathVariable Long id, @RequestBody Map<String, Object> body) {
    Submission s = submissions.findById(id).orElseThrow();
    s.grade = Double.valueOf(body.get("grade").toString());
    s.feedback = String.valueOf(body.getOrDefault("feedback", ""));
    s.status = "EVALUADO";
    submissions.save(s);

    Notification n = new Notification();
    n.user = s.student;
    n.title = "Retroalimentacion publicada";
    n.message = "Tu entrega fue evaluada. Nota: " + s.grade + (s.feedback == null || s.feedback.isBlank() ? "" : ". Retroalimentacion: " + s.feedback);
    notifications.save(n);
    return s;
  }

  @GetMapping(value = "/export/submissions.csv", produces = "text/csv")
  public ResponseEntity<String> export() {
    StringBuilder sb = new StringBuilder("id,estudiante,caso,estado,puntaje_auto,nota\n");
    for (Submission s : submissions.findAll()) {
      sb.append(s.id).append(',').append(s.student.name).append(',').append(s.assignment.caseStudy.title.replace(",", " ")).append(',').append(s.status).append(',').append(s.autoScore).append(',').append(s.grade == null ? "" : s.grade).append('\n');
    }
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=submissions.csv").body(sb.toString());
  }
}
