package com.novasoft.psicoapp.model; import jakarta.persistence.*;
@Entity public class AnswerOption{ @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id; @Column(length=1000) public String text; public boolean correct; @Column(length=1500) public String justification; @ManyToOne public Question question; }
