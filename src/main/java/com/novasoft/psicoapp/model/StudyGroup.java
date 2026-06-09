package com.novasoft.psicoapp.model; import jakarta.persistence.*; import java.util.*;
@Entity public class StudyGroup{ @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id; public String name; @ManyToOne public Course course; @ManyToMany public Set<User> students=new HashSet<>(); }
